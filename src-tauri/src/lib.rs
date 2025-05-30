use crate::mods::get_mod_versions;
use dotenv::dotenv;
use downloader_mc::client::{DownloadVersion, Launcher};
use downloader_mc::launcher_manifest::{FabricLoaderManifest, LauncherManifestVersion};
use downloader_mc::prelude::{ClientDownloader, Reporter};
use keyring::Entry;
use mc_bootstrap::{ClientAuth, ClientBootstrap, ClientSettings, ClientVersion};
use minecraft_msa_auth::MinecraftAuthorizationFlow;
use mods::fetch_mods;
use oauth2::basic::BasicClient;
use oauth2::{
    AuthType, AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge, RedirectUrl,
    Scope, TokenResponse, TokenUrl,
};
use pbr::ProgressBar;
use reqwest::{Client, ClientBuilder, Url};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::{env, fs};
use std::{
    io::Stdout,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::Emitter;
use tauri::Window;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as TokioBufReader};
use tokio::net::TcpListener;
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize)]
pub struct PlayerSkin {
    pub id: String,
    pub state: String,
    pub url: String,
    pub variant: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PlayerCape {
    pub id: String,
    pub state: String,
    pub url: String,
    pub alias: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PlayerProfile {
    pub id: String,
    pub name: String,
    pub skins: Vec<PlayerSkin>,
    pub capes: Vec<PlayerCape>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PackageInfo {
    name: String,
    version: String,
    version_type: String,
    uuid: Uuid,
    path: PathBuf,
}

mod mods;

#[tauri::command]
async fn find_instance_by_uuid(target_uuid: Uuid) -> Result<Option<PackageInfo>, String> {
    let base_dir = get_base_dir().join("instances");

    let mut read_dir = match tokio::fs::read_dir(&base_dir).await {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to read launcher directory: {}", e)),
    };

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let path = entry.path();

        if path.is_dir() {
            let json_path = path.join("instance.json");

            if tokio::fs::try_exists(&json_path).await.unwrap_or(false) {
                if let Ok(content) = tokio::fs::read(&json_path).await {
                    if let Ok(info) = serde_json::from_slice::<PackageInfo>(&content) {
                        if info.uuid == target_uuid {
                            return Ok(Some(info));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

fn write_instance_json(name: String, version: String, version_type: String) -> Result<(), ()> {
    let info = PackageInfo {
        name: name.clone(),
        version: version,
        version_type: version_type,
        uuid: Uuid::new_v4(),
        path: get_mc_dir(&name),
    };
    let json = serde_json::to_string_pretty(&info).unwrap();
    let path = get_mc_dir(&name).join("instance.json");
    let mut file = File::create(path).expect("File not found");
    file.write_all(json.as_bytes()).expect("Writing failed");
    Ok(())
}

#[tauri::command]
fn open_instance_folder(name: String) {
    open::that(get_mc_dir(&name)).unwrap()
}

#[tauri::command]
async fn load_instances() -> Result<Vec<PackageInfo>, String> {
    let mut instances = Vec::new();
    let base_dir = get_base_dir().join("instances");

    let read_dir = match tokio::fs::read_dir(&base_dir).await {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to read launcher directory: {}", e)),
    };

    let mut dir_entries = read_dir;

    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        let path = entry.path();

        if path.is_dir() {
            let json_path = path.join("instance.json");

            if tokio::fs::try_exists(&json_path).await.unwrap_or(false) {
                match tokio::fs::read(&json_path).await {
                    Ok(content) => match serde_json::from_slice::<PackageInfo>(&content) {
                        Ok(info) => {
                            instances.push(info);
                        }
                        Err(e) => {
                            eprintln!("Failed to parse instance.json at {:?}: {}", json_path, e);
                        }
                    },
                    Err(e) => {
                        eprintln!("Failed to read instance.json at {:?}: {}", json_path, e);
                    }
                }
            }
        }
    }

    Ok(instances)
}

pub struct ProgressTrack {
    curr: AtomicU64,
    total: AtomicU64,
    pb: Mutex<ProgressBar<Stdout>>,
    window: Window, // pass window here
}

impl ProgressTrack {
    pub fn new(window: Window) -> Self {
        Self {
            curr: AtomicU64::new(0),
            total: AtomicU64::new(0),
            pb: Mutex::new(ProgressBar::new(0)),
            window,
        }
    }
}

impl Reporter for ProgressTrack {
    fn setup(&mut self, max_progress: u64) {
        self.total.store(max_progress, Ordering::SeqCst);
        let mut pb = self.pb.lock().unwrap();
        *pb = ProgressBar::new(max_progress);
        pb.set_units(pbr::Units::Bytes);
        pb.format("[=> ]");

        let _ = self.window.emit("download-progress", 0u64);
    }

    fn progress(&mut self, current: u64) {
        let new_val = self.curr.fetch_add(current, Ordering::SeqCst) + current;
        let total = self.total.load(Ordering::SeqCst);

        let percent = if total > 0 {
            (new_val as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        let _ = self.window.emit("download-progress", percent);
        let mut pb = self.pb.lock().unwrap();
        pb.set(new_val);
    }

    fn done(&mut self) {
        let _ = self.window.emit("download-complete", ());
        let mut pb = self.pb.lock().unwrap();
        pb.finish();
    }
}

fn get_base_dir() -> PathBuf {
    return PathBuf::from("/home/aapelix/launcher/");
}

fn get_mc_dir(name: &str) -> PathBuf {
    return PathBuf::from(format!("/home/aapelix/launcher/instances/{}", name));
}

fn get_java_path() -> PathBuf {
    return PathBuf::from("/usr/lib/jvm/java-21-openjdk/bin/java");
}

#[tauri::command]
async fn delete_instance(name: &str) -> Result<(), ()> {
    tokio::fs::remove_dir_all(get_mc_dir(name))
        .await
        .expect("Deleting instance failed");

    Ok(())
}

#[tauri::command]
async fn launch_instance(name: String, version: String, version_type: String) {
    let profile = get_player_profile().await.unwrap();
    let entry = Entry::new("minecraft_auth", "minecraft_user").unwrap();
    let token = entry.get_password().unwrap();

    let bootstrap = ClientBootstrap::new(ClientSettings {
        assets: get_base_dir().join("assets"),
        auth: ClientAuth {
            username: profile.name,
            access_token: Some(token),
            uuid: Some(profile.id),
        },
        game_dir: get_mc_dir(&name),
        java_bin: get_java_path(),
        libraries_dir: get_base_dir().join("libraries"),
        manifest_file: get_mc_dir(&name).join("manifest.json"),
        natives_dir: get_base_dir()
            .join("versions")
            .join(&version)
            .join("natives"),
        version: ClientVersion {
            version: version.clone(),
            version_type: version_type,
        },
        version_jar_file: get_base_dir()
            .join("versions")
            .join(&version)
            .join(format!("{}.jar", &version)),
        quick_play_path: None,
        quick_play_singleplayer: None,
        quick_play_multiplayer: None,
        quick_play_realms: None,
    });

    bootstrap.launch().unwrap();
}

#[tauri::command]
async fn get_minecraft_versions() -> Result<Vec<LauncherManifestVersion>, ()> {
    let path = get_base_dir().join("jsons").join("minecraft_versions.json");

    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(versions) = serde_json::from_str::<Vec<LauncherManifestVersion>>(&data) {
            return Ok(versions);
        }
    }

    let versions = tokio::task::spawn_blocking(|| {
        let downloader = ClientDownloader::new().map_err(|_| ())?;
        let versions = downloader.get_list_versions();
        Ok::<_, ()>(versions)
    })
    .await
    .map_err(|_| ())??;

    if let Ok(json) = serde_json::to_string(&versions) {
        let _ = fs::create_dir_all(&path.parent().unwrap());
        let _ = fs::write(&path, json);
    }

    Ok(versions)
}

#[tauri::command]
async fn get_fabric_loader_versions(version: String) -> Result<Vec<FabricLoaderManifest>, ()> {
    let path = get_base_dir()
        .join("jsons")
        .join("fabric")
        .join(format!("loader_versions_{version}.json"));

    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(versions) = serde_json::from_str::<Vec<FabricLoaderManifest>>(&data) {
            return Ok(versions);
        }
    }

    let versions = tokio::task::spawn_blocking(move || {
        let downloader = ClientDownloader::new().map_err(|_| ())?;
        let versions = downloader
            .get_list_fabric_loader_versions(version.as_str())
            .map_err(|_| ())?;
        Ok::<_, ()>(versions)
    })
    .await
    .map_err(|_| ())??;

    if let Ok(json) = serde_json::to_string(&versions) {
        let _ = fs::create_dir_all(&path.parent().unwrap());
        let _ = fs::write(&path, json);
    }

    Ok(versions)
}

#[tauri::command]
async fn download_minecraft_version(
    window: tauri::Window,
    path: Option<String>,
    version: Option<String>,
    name: String,
    version_type: String,
    launcher: Option<String>,
    launcher_id: Option<String>,
) -> Result<String, String> {
    let path = path.unwrap_or_else(|| "./.minecraft".to_string());
    let version = version.unwrap_or_else(|| "1.19.4".to_string());
    let launcher_type = match launcher.as_deref() {
        Some("fabric") => Launcher::Fabric,
        Some("forge") => Launcher::Forge,
        _ => Launcher::Vanilla,
    };

    let launcher_id_clone = launcher_id.clone();
    let version_clone = version.clone();
    let name_clone = name.clone();
    let version_type_clone = version_type.clone();

    let result = tokio::task::spawn_blocking(move || {
        let downloader = ClientDownloader::new().map_err(|e| e.to_string())?;

        downloader
            .download_version(
                &version_clone,
                &PathBuf::from(&path),
                &get_base_dir(),
                None,
                None,
                Some(launcher_type),
                launcher_id_clone.as_deref(),
                Some(Arc::new(Mutex::new(ProgressTrack::new(window)))),
            )
            .map_err(|e| e.to_string())?;

        let _ = write_instance_json(name_clone, version_clone, version_type_clone);

        Ok(format!("Downloaded Minecraft version"))
    })
    .await
    .map_err(|e| format!("Join error: {:?}", e))?;

    result
}

async fn sign_in_async() -> Result<PlayerProfile, Box<dyn std::error::Error>> {
    dotenv().ok();

    let client_id = env::var("CLIENT_ID").expect("No CLIENT_ID found");

    let client = BasicClient::new(ClientId::new(client_id))
        .set_auth_uri(AuthUrl::new(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize".to_string(),
        )?)
        .set_token_uri(TokenUrl::new(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/token".to_string(),
        )?)
        .set_auth_type(AuthType::RequestBody)
        .set_redirect_uri(RedirectUrl::new(
            "http://127.0.0.1:8114/redirect".to_string(),
        )?);

    let (pkce_code_challenge, pkce_code_verifier) = PkceCodeChallenge::new_random_sha256();

    let (authorize_url, _csrf_state) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("XboxLive.signin offline_access".to_string()))
        .set_pkce_challenge(pkce_code_challenge)
        .url();

    webbrowser::open(authorize_url.as_str())?;

    let listener = TcpListener::bind("127.0.0.1:8114").await?;
    let (stream, _) = listener.accept().await?;
    stream.readable().await?;
    let mut stream = TokioBufReader::new(stream);

    let code;
    let _state;
    {
        let mut request_line = String::new();
        stream.read_line(&mut request_line).await?;
        let redirect_url = request_line.split_whitespace().nth(1).unwrap();
        let url = Url::parse(&("http://localhost".to_string() + redirect_url))?;

        let (_key, value) = url
            .query_pairs()
            .find(|(key, _value)| key == "code")
            .unwrap();
        code = AuthorizationCode::new(value.into_owned());

        let (_key, value) = url
            .query_pairs()
            .find(|(key, _value)| key == "state")
            .unwrap();
        _state = CsrfToken::new(value.into_owned());
    }

    let message = "Go back to your terminal :)";
    let response = format!(
        "HTTP/1.1 200 OK\r\ncontent-length: {}\r\n\r\n{}",
        message.len(),
        message
    );
    stream.get_mut().write_all(response.as_bytes()).await?;

    let http_client = ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .build()?;

    let token = client
        .exchange_code(code)
        .set_pkce_verifier(pkce_code_verifier)
        .request_async(&http_client)
        .await?;

    let mc_flow = MinecraftAuthorizationFlow::new(Client::new());
    let mc_token = mc_flow
        .exchange_microsoft_token(token.access_token().secret())
        .await?;

    let entry = Entry::new("minecraft_auth", "minecraft_user")?;
    entry.set_password(mc_token.access_token().as_ref())?;

    let profile = get_player_profile().await.unwrap();

    Ok(profile)
}

#[tauri::command]
async fn get_player_profile() -> Result<PlayerProfile, ()> {
    let entry = Entry::new("minecraft_auth", "minecraft_user").unwrap();
    let token = entry.get_password().unwrap();

    let client = Client::new();
    let res = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(token)
        .send()
        .await
        .unwrap();

    let profile = res.json::<PlayerProfile>().await.unwrap();

    Ok(profile)
}

#[tauri::command]
async fn sign_in() -> Result<PlayerProfile, ()> {
    let profile = sign_in_async().await.unwrap();

    Ok(profile)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_player_profile,
            sign_in,
            download_minecraft_version,
            get_minecraft_versions,
            launch_instance,
            load_instances,
            delete_instance,
            get_fabric_loader_versions,
            open_instance_folder,
            fetch_mods,
            find_instance_by_uuid,
            get_mod_versions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
