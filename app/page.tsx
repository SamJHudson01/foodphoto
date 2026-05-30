import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.shell}>
      <section className={styles.header}>
        <p className={styles.kicker}>Personal tracker</p>
        <h1 className={styles.title}>Food Photos</h1>
        <p className={styles.summary}>
          Take a food photo, save the time, add an optional note, and review the
          day later.
        </p>
      </section>

      <section className={styles.emptyState} aria-label="Food photo gallery">
        <div className={styles.cameraMark} aria-hidden="true" />
        <h2 className={styles.emptyTitle}>No photos yet</h2>
        <p className={styles.emptyText}>
          The first build step is the local camera and gallery flow.
        </p>
        <button className={styles.captureButton} type="button">
          Open Camera
        </button>
      </section>
    </main>
  );
}
