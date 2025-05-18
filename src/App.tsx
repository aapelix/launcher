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
      <main>
        <nav class="flex justify-between px-2 py-2 items-center">
          {!profile() && (
            <button class="btn" onClick={() => signIn()}>
              Sign in
            </button>
          )}

          {profile() && (
            <div class="flex items-center gap-2 hover:bg-[#e9e9e9] px-2 py-1 rounded-lg duration-300 cursor-pointer">
              <img
                class="rounded-lg h-8"
                src={`https://crafatar.com/avatars/${profile()!.id}`}
              />
              <p class="text-2xl font-bold">{profile()!.name}</p>
            </div>
          )}

          <div class="flex gap-3">
            <a
              href="/new"
              class="hover:bg-[#e9e9e9] px-2 py-1 rounded-lg duration-300 cursor-pointer"
            >
              New Instance
            </a>
            <a
              href="/"
              class="hover:bg-[#e9e9e9] px-2 py-1 rounded-lg duration-300 cursor-pointer"
            >
              Instances
            </a>
            <a
              href="/conf"
              class="hover:bg-[#e9e9e9] px-2 py-1 rounded-lg duration-300 cursor-pointer"
            >
              Settings
            </a>
          </div>
        </nav>
      </main>
      {props.children}
    </>
  );
}

export default App;
