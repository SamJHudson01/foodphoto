"use client";

import { useState } from "react";
import FoodPhotoApp from "./food-photo-app";
import GuitarPracticeApp from "./guitar-practice-app";
import styles from "./page.module.css";

export function SamAppShell() {
  const [surface, setSurface] = useState<"food" | "guitar">("food");

  return (
    <>
      <nav className={styles.tabbar} aria-label="SamApp sections">
        <button
          type="button"
          className={surface === "food" ? styles.tabOn : ""}
          onClick={() => setSurface("food")}
        >
          <CameraIcon />
          <span>FoodPhoto</span>
        </button>
        <button
          type="button"
          className={surface === "guitar" ? styles.tabOn : ""}
          onClick={() => setSurface("guitar")}
        >
          <GuitarIcon />
          <span>Guitar</span>
        </button>
      </nav>
      {surface === "food" ? <FoodPhotoApp /> : <GuitarPracticeApp />}
    </>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 4 16 6.5h3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3L9.5 4h5Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function GuitarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7c0-2.5 3-4 7-4s7 1.5 7 4c0 5-5 14-7 14S5 12 5 7Z" />
      <path d="M12 8.5v9" />
    </svg>
  );
}
