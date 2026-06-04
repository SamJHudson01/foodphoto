import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import styles from "./page.module.css";
import { SamAppShell } from "./sam-app-shell";

export default function Home() {
  return (
    <>
      <Show when="signed-in">
        <div className={styles.accountControl}>
          <UserButton />
        </div>
        <SamAppShell />
      </Show>

      <Show when="signed-out">
        <main className={styles.authShell}>
          <section className={styles.authPanel}>
            <img className={styles.authLogo} src="/sam.jpeg" alt="" />
            <h1>SamApp</h1>
            <p>Sign in to keep your private practice and food evidence stored safely with your account.</p>
            <SignInButton mode="modal">
              <button className={styles.primaryButton} type="button">
                Sign in
              </button>
            </SignInButton>
          </section>
        </main>
      </Show>
    </>
  );
}
