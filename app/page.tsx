import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import FoodPhotoApp from "./food-photo-app";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <Show when="signed-in">
        <div className={styles.accountControl}>
          <UserButton />
        </div>
        <FoodPhotoApp />
      </Show>

      <Show when="signed-out">
        <main className={styles.authShell}>
          <section className={styles.authPanel}>
            <span className={styles.brandMark} />
            <h1>FoodPhoto</h1>
            <p>Sign in to keep your food photos stored safely with your account.</p>
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
