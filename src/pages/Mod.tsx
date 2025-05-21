import { useParams } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { Download, ExternalLink } from "lucide-solid";
import { createEffect, createSignal, onMount } from "solid-js";

type SupportedPlatforms = "required" | "optional" | "unsupported" | "unknown";

type ProjectType = "mod" | "modpack" | "resourcepack" | "shader";

interface Mod {
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: SupportedPlatforms;
  server_side: SupportedPlatforms;
  project_type: ProjectType;
  downloads: number;
  icon_url: string;
  color: number;
  project_id: string;
  author: string;
  display_categories: string[];
  versions: string[];
  follows: number;
  date_modified: string;
  latest_version: string;
  license: string;
}

interface SearchResult {
  hits: Mod[];
  offset: number;
  limit: number;
  total_hits: number;
}

type Instance = {
  name: string;
  version: string;
  version_type: string;
  uuid: String;
  path: String;
  running: boolean | null;
};

type ModVersion = {
  name: string;
  version_number: string;
  changelog: string;
  files: ModVersionFile[];
};

type ModVersionFile = {
  url: string;
  filename: string;
};

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
  return num.toString();
}

function timeAgo(isoDate: string): string {
  const now = new Date();
  const then = new Date(isoDate);
  const diff = now.getTime() - then.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? "s" : ""} ago`;
  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
}

function toKebabCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Mod() {
  const params = useParams();

  const [query, setQuery] = createSignal("");
  const [facets, setFacets] = createSignal<String[][]>([[]]);
  const [index, setIndex] = createSignal("downloads");
  const [offset, setOffset] = createSignal(0);
  const [limit, setLimit] = createSignal(20);
  const [instance, setInstance] = createSignal<Instance | null>(null);

  const [download, setDownload] = createSignal<Mod | null>(null);
  const [versions, setVersions] = createSignal<ModVersion[]>([]);

  const [mods, setMods] = createSignal<Mod[]>([]);

  async function get_instance_data() {
    try {
      let data = await invoke<Instance>("find_instance_by_uuid", {
        targetUuid: params.instance,
      });

      setInstance(data);
      setFacets([[`versions:${data.version}`]]);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetch_mods() {
    try {
      let data = await invoke<SearchResult>("fetch_mods", {
        query: query(),
        facets: facets(),
        index: index(),
        offset: offset(),
        limit: limit(),
      });

      setMods(data.hits);
    } catch (err) {
      console.error(err);
    }
  }

  async function getModVersions() {
    try {
      let versions = await invoke<ModVersion[]>("get_mod_versions", {
        id: download()?.project_id,
        gameVersions: [instance()?.version],
        loaders: ["fabric"],
      });

      setVersions(versions);
    } catch (err) {
      console.error(err);
    }
  }

  function selectMod(mod: Mod) {
    setDownload(mod);
    const modal = document.getElementById(
      "download_modal",
    ) as HTMLDialogElement;
    modal?.showModal();
  }

  createEffect(async () => {
    await getModVersions();
  });

  onMount(async () => {
    await get_instance_data();
    await fetch_mods();
  });

  return (
    <>
      <div class="flex justify-center w-screen mt-4 pb-14 h-screen bg-base-200">
        <div class="py-2 px-2 flex flex-col gap-2 max-w-[800px] w-full">
          <p class="font-bold text-2xl">Mods</p>
          {mods().map((mod) => (
            <div class="card bg-base-100 border border-base-300">
              <div class="card-body">
                <div class="card-title justify-between">
                  <div class="flex flex-row gap-2">
                    <img class="w-8 h-8 rounded-lg" src={mod.icon_url} />
                    <p class="card-title">{mod.title}</p>
                  </div>
                  <div class="flex flex-row gap-2">
                    <Download />
                    {formatNumber(mod.downloads)}
                  </div>
                </div>
                <p class="w-2/3">{mod.description}</p>
                <div class="flex justify-between w-screen">
                  <div class="flex flex-row gap-2">
                    {mod.display_categories.map((cat) => (
                      <p class="label">
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </p>
                    ))}
                  </div>
                  <p class="flex justify-end -translate-x-18">
                    Updated {timeAgo(mod.date_modified)}
                  </p>
                </div>
                <div class="card-actions justify-end">
                  <a
                    href={`https://modrinth.com/mod/${toKebabCase(mod.title)}`}
                    class="btn btn-square btn-outline"
                  >
                    <ExternalLink />
                  </a>
                  <button class="btn" onClick={() => selectMod(mod)}>
                    Download
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <dialog id="download_modal" class="modal">
        <div class="modal-box">
          <h3 class="text-lg font-bold">Select a version to download</h3>
          <div class="modal-action">
            <form method="dialog" class="flex gap-2">
              <select class="select">
                <option disabled selected>
                  Pick a version
                </option>
                {versions().map((version) => (
                  <option>{version.version_number}</option>
                ))}
              </select>
              <button class="btn btn-secondary" onClick={() => {}}>
                Download
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
