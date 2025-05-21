use serde::{Deserialize, Serialize};
use urlencoding::encode;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum SupportedPlatforms {
    Required,
    Optional,
    Unsupported,
    Unknown,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum ProjectType {
    Mod,
    Modpack,
    Resourcepack,
    Shader,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SearchResult {
    hits: Vec<Mod>,
    offset: i64,
    limit: i64,
    total_hits: i64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Mod {
    slug: String,
    title: String,
    description: String,
    categories: Vec<String>,
    client_side: SupportedPlatforms,
    server_side: SupportedPlatforms,
    project_type: ProjectType,
    downloads: i64,
    icon_url: String,
    color: i64,
    project_id: String,
    author: String,
    display_categories: Vec<String>,
    versions: Vec<String>,
    follows: i64,
    date_modified: String,
    latest_version: String,
    license: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ModVersion {
    name: String,
    version_number: String,
    changelog: String,
    files: Vec<ModVersionFile>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ModVersionFile {
    url: String,
    filename: String,
}

#[tauri::command]
pub async fn fetch_mods(
    query: String,
    facets: Vec<Vec<String>>,
    index: String,
    offset: i64,
    limit: i64,
) -> Result<SearchResult, ()> {
    let facets_json = serde_json::to_string(&facets).unwrap();
    let encoded_facets = encode(&facets_json);
    let url = format!("https://api.modrinth.com/v2/search?query={query}&facets={encoded_facets}&index={index}&offset={offset}&limit={limit}");
    println!("{:?}", url);
    let res = reqwest::get(url).await.unwrap();
    let result: SearchResult = res.json().await.unwrap();
    Ok(result)
}

#[tauri::command]
pub async fn get_mod_versions(
    id: String,
    game_versions: String,
    loaders: String,
) -> Result<Vec<ModVersion>, ()> {
    let json = serde_json::to_string(&game_versions).unwrap();
    let encoded_vers = encode(&json);

    let json_loaders = serde_json::to_string(&loaders).unwrap();
    let encoded_loaders = encode(&json_loaders);

    let url = format!("https://api.modrinth.com/v2/{id}/version?game_versions={encoded_vers}&loaders={encoded_loaders}");
    println!("{:?}", url);
    let res = reqwest::get(url).await.unwrap();
    let result: Vec<ModVersion> = res.json().await.unwrap();
    Ok(result)
}
