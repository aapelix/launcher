import { invoke } from "@tauri-apps/api/core";

export default function Instances() {
  async function launch() {
    try {
      await invoke("launch_instance", {
        name: "1.21.5",
        version: "1.21.5",
        versionType: "release",
      });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <h1>Instances</h1>
      <button class="btn" onClick={() => launch()}>
        Launch test
      </button>
    </div>
  );
}
