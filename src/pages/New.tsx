import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSignal, onMount, For, createEffect } from "solid-js";
import { onCleanup } from "solid-js";

type LauncherManifestVersion = {
  id: string; // e.g. "1.19.4"
  type: "release" | "snapshot" | "old_alpha" | "old_beta";
  url: string; // url to version metadata JSON
  time: string; // ISO timestamp of release time
  releaseTime: string; // ISO timestamp of release date
};

export interface FabricLoaderManifest {
  loader: {
    separator: string;
    build: number;
    maven: string;
    version: string;
    stable: boolean;
  };
}

export default function New() {
  const [versions, setVersions] = createSignal<LauncherManifestVersion[]>([]);
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal<LauncherManifestVersion | null>(
    null,
  );

  const [fabricVersions, setFabricVersions] = createSignal<
    FabricLoaderManifest[]
  >([]);

  const [progress, setProgress] = createSignal(0);

  const [name, setName] = createSignal("");

  const loaders = ["Vanilla", "Fabric", "Forge", "NeoForge", "Quilt"];

  const [loader, setLoader] = createSignal(loaders[0]);
  const [loaderVersion, setLoaderVersion] =
    createSignal<FabricLoaderManifest | null>(null);
  const [downloading, setDownloading] = createSignal(false);

  createEffect(async () => {
    if (selected() != null) {
      if (loader() == "Fabric") {
        await getFabricVersions(selected()!);
      }
    }
  });

  async function getFabricVersions(version: LauncherManifestVersion) {
    try {
      const data = await invoke<FabricLoaderManifest[]>(
        "get_fabric_loader_versions",
        { version: version.id },
      );
      setFabricVersions(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function downloadVersion() {
    try {
      setDownloading(true);
      const modal = document.getElementById("my_modal_1") as HTMLDialogElement;
      modal?.showModal();

      const res = await invoke("download_minecraft_version", {
        path: "/home/aapelix/launcher/instances/" + name(),
        version: selected()?.id,
        name: name(),
        versionType: selected()?.type,
        launcher: loader()?.toLowerCase(),
        launcherId: loaderVersion()?.loader.version,
      });

      console.log(res);
    } catch (err) {
      console.error(err);
    }
  }

  onMount(() => {
    const unlisten = listen<number>("download-progress", (event) => {
      setProgress(event.payload);
    });

    const unlisten_2 = listen("download-complete", () => {
      setDownloading(false);
    });

    onCleanup(async () => {
      (await unlisten)();
      (await unlisten_2)();
    });
  });

  onMount(async () => {
    try {
      const data = await invoke<LauncherManifestVersion[]>(
        "get_minecraft_versions",
      );
      setVersions(data);
    } catch (err) {
      console.error(err);
    }
  });

  const filtered = () =>
    versions().filter((v) =>
      v.id.toLowerCase().includes(filter().toLowerCase()),
    );

  return (
    <>
      <div class="flex justify-center w-screen mt-4 pb-14 items-center">
        <div class="py-2 px-2 flex flex-col max-w-[800px] w-full">
          <h1>Create a new instance</h1>

          <label class="label mt-3">Instance name</label>
          <input
            type="text"
            id="name"
            class="input w-full"
            placeholder="Untitled"
            value={name()}
            onChange={(e) => setName(e.target.value)}
          />

          <label class="label mt-3">Version</label>
          <input
            type="text"
            class="input w-full"
            placeholder="Select a version"
            id="version"
            value={selected()?.id}
            onInput={(e) => {
              setFilter(e.currentTarget.value);
            }}
          />

          <div class="max-h-[300px] rounded-sm overflow-y-auto border border-gray-300 bg-white z-50 w-full mt-1">
            <For each={filtered()}>
              {(v) => (
                <div
                  class="p-1 cursor-pointer hover:bg-[#e9e9e9]"
                  onClick={() => {
                    setSelected(v);
                    setFilter("");
                  }}
                >
                  {v.id}
                </div>
              )}
            </For>
          </div>

          <label class="label mt-3">Loader</label>
          {loaders.map((name, i) => (
            <div class="flex gap-1 items-center">
              <input
                type="radio"
                name="radio-loader"
                class="radio radio-sm"
                checked={i == 0}
                onChange={() => setLoader(name)}
                value={name}
              />
              <label>{name}</label>
            </div>
          ))}

          {loader() == "Fabric" && (
            <>
              <label class="label mt-3">Fabric Version</label>
              <p class="input w-full">{loaderVersion()?.loader.version}</p>
              <div class="max-h-[300px] rounded-sm overflow-y-auto border border-gray-300 bg-white z-50 w-full mt-1">
                <For each={fabricVersions()}>
                  {(version) => (
                    <div
                      class="p-1 cursor-pointer hover:bg-[#e9e9e9]"
                      onClick={() => {
                        setLoaderVersion(version);
                      }}
                    >
                      {version.loader.version}
                    </div>
                  )}
                </For>
              </div>
            </>
          )}

          <button
            disabled={!name() && !selected()}
            class="btn mt-3 w-full"
            onClick={() => downloadVersion()}
          >
            Create
          </button>
        </div>
      </div>

      <dialog
        id="my_modal_1"
        class="modal"
        onClick={(e) => {
          if (downloading()) e.stopPropagation(); // prevent outside click closing
        }}
        onCancel={(e) => {
          if (downloading()) e.preventDefault(); // prevent esc closing
        }}
      >
        <div class="modal-box flex flex-col items-center">
          <p class="py-4">
            {downloading() ? "Downloading" : "Download complete!"}
          </p>
          <progress
            class="progress w-56"
            value={progress()}
            max={100}
          ></progress>
          {!downloading() && (
            <button
              class="btn py-4"
              onClick={() => {
                const modal = document.getElementById(
                  "my_modal_1",
                ) as HTMLDialogElement;
                modal?.close("downloadComplete");
              }}
            >
              Close
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
