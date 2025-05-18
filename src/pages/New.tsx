import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSignal, onMount, For } from "solid-js";
import { onCleanup } from "solid-js";

type LauncherManifestVersion = {
  id: string; // e.g. "1.19.4"
  type: "release" | "snapshot" | "old_alpha" | "old_beta";
  url: string; // url to version metadata JSON
  time: string; // ISO timestamp of release time
  releaseTime: string; // ISO timestamp of release date
};

export default function New() {
  const [versions, setVersions] = createSignal<LauncherManifestVersion[]>([]);
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal("");

  const [progress, setProgress] = createSignal(0);

  const [name, setName] = createSignal("");

  const loaders = ["Vanilla", "Fabric", "Forge", "NeoForge", "Quilt"];

  const [loader, setLoader] = createSignal(loaders[0]);

  async function downloadVersion() {
    try {
      const modal = document.getElementById("my_modal_1") as HTMLDialogElement;
      modal?.showModal();

      const res = await invoke("download_minecraft_version", {
        path: "/home/aapelix/launcher/" + name(),
        version: selected(),
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

    onCleanup(async () => {
      (await unlisten)();
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
      <div class="flex justify-center w-screen mt-32 items-center">
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
            value={selected()}
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
                    setSelected(v.id);
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

          <button class="btn mt-3 w-full" onClick={() => downloadVersion()}>
            Create
          </button>
        </div>
      </div>

      <dialog id="my_modal_1" class="modal">
        <div class="modal-box flex flex-col items-center">
          <p class="py-4">Downloading</p>
          <progress
            class="progress w-56"
            value={progress()}
            max={100}
          ></progress>
        </div>
      </dialog>
    </>
  );
}
