import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type PlayerSkin = {
  id: string;
  state: string;
  url: string;
  variant: string;
};

type PlayerCape = {
  id: string;
  state: string;
  url: string;
  alias: string;
};

type PlayerProfile = {
  id: string;
  name: string;
  skins: PlayerSkin[];
  capes: PlayerCape[];
};

function App(props: any) {
  const [profile, setProfile] = createSignal<PlayerProfile | null>(null);

  async function signIn() {
    try {
      const data = await invoke<PlayerProfile>("sign_in");
      setProfile(data);
    } catch (err) {
      console.error("sign in failed:", err);
    }
  }

  onMount(async () => {
    try {
      const data = await invoke<PlayerProfile>("get_player_profile");
      setProfile(data);
    } catch (err) {
      console.warn("no existing session", err);
    }
  });

  return (
    <>
      <main class="bg-base-200 h-full">
        <nav class="flex justify-between px-2 py-2 items-center">
          {!profile() && (
            <button class="btn" onClick={() => signIn()}>
              Sign in
            </button>
          )}

          {profile() && (
            <div class="flex items-center gap-2 btn btn-ghost">
              <img
                class="rounded-lg h-8"
                src={`https://crafatar.com/avatars/${profile()!.id}`}
              />
              <p class="text-2xl font-bold">{profile()!.name}</p>
            </div>
          )}

          <div class="flex gap-3">
            <a href="/new" class="btn btn-ghost">
              New Instance
            </a>
            <a href="/" class="btn btn-ghost">
              Instances
            </a>
            <a href="/conf" class="btn btn-ghost">
              Settings
            </a>
          </div>
        </nav>
        {props.children}
      </main>
    </>
  );
}

export default App;
