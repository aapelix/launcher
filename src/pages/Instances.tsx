import { useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { Ban, Folder, Package, Play, Trash } from "lucide-solid";
import { createSignal, onMount } from "solid-js";

type Instance = {
  name: string;
  version: string;
  version_type: string;
  uuid: String;
  path: String;
  running: boolean | null;
};

export default function Instances() {
  const [instances, setInstances] = createSignal<Instance[]>([]);
  const [instanceDel, setInstanceDel] = createSignal<Instance | null>(null);

  async function deleteInstance() {
    if (instanceDel()) {
      try {
        await invoke("delete_instance", { name: instanceDel()?.name });
        setInstanceDel(null);

        await getInstances();
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function launch(name: string, version: string, versionType: string) {
    try {
      setInstances((prev) =>
        prev.map((inst) =>
          inst.name === name &&
          inst.version === version &&
          inst.version_type === versionType
            ? { ...inst, running: true }
            : inst,
        ),
      );

      await invoke("launch_instance", {
        name: name,
        version: version,
        versionType: versionType,
      });

      setInstances((prev) =>
        prev.map((inst) =>
          inst.name === name &&
          inst.version === version &&
          inst.version_type === versionType
            ? { ...inst, running: false }
            : inst,
        ),
      );
    } catch (err) {
      console.error(err);
    }
  }

  function hideModal() {
    const modal = document.getElementById("delete_modal") as HTMLDialogElement;
    modal?.close();
  }

  async function getInstances() {
    let instances = await invoke<Instance[]>("load_instances");
    setInstances(instances);
  }

  onMount(async () => {
    try {
      await getInstances();
    } catch (err) {
      console.error(err);
    }
  });

  const navigate = useNavigate();

  return (
    <>
      <div class="flex justify-center w-screen mt-32 h-screen bg-base-200">
        <div class="py-2 px-2 flex flex-col gap-2 max-w-[800px] w-full">
          {instances().length == 0 && (
            <p class="text-center">No instances found</p>
          )}
          {instances().map((instance) => (
            <div class="card border border-base-300 bg-base-100 w-full">
              <div class="card-body">
                <div class="card-title">
                  <h2>{instance.name}</h2>-<h2>{instance.version}</h2>
                </div>
                <div class="justify-end card-actions">
                  {instance.running ? (
                    <>
                      <button class="btn btn-ghost" disabled>
                        Running
                      </button>
                      <button
                        class="btn btn-square"
                        onClick={() =>
                          invoke("open_instance_folder", {
                            name: instance.name,
                          })
                        }
                      >
                        <Folder />
                      </button>
                      <button class="btn btn-square">
                        <Ban />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        class="btn btn-square"
                        onClick={() =>
                          invoke("open_instance_folder", {
                            name: instance.name,
                          })
                        }
                      >
                        <Folder />
                      </button>
                      <button
                        onClick={() => navigate("/mod/" + instance.uuid)}
                        class="btn btn-square"
                      >
                        <Package />
                      </button>
                      <button
                        class="btn btn-square"
                        onClick={() => {
                          setInstanceDel(instance);

                          const modal = document.getElementById(
                            "delete_modal",
                          ) as HTMLDialogElement;
                          modal?.showModal();
                        }}
                      >
                        <Trash />
                      </button>
                      <button
                        class="btn btn-square"
                        onClick={() =>
                          launch(
                            instance.name,
                            instance.version,
                            instance.version_type,
                          )
                        }
                      >
                        <Play />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          <a href="/new" class="btn">
            New instance
          </a>
        </div>
      </div>

      <dialog id="delete_modal" class="modal">
        <div class="modal-box">
          <h3 class="text-lg font-bold">Confirm your life choices</h3>
          <p class="py-4">Are you sure you want to delete this instance?</p>
          <div class="modal-action">
            <form method="dialog" class="flex gap-2">
              <button
                class="btn"
                onClick={() => {
                  setInstanceDel(null);
                  hideModal();
                }}
              >
                Cancel
              </button>
              <button
                class="btn btn-error"
                onClick={() => {
                  deleteInstance();
                  hideModal();
                }}
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
