const API_URL = "http://localhost:5173/api/v1/upload/send";

let hashtags = "";
let hashtagList = [];
let copyTimeout = null;
let toastTimeout = null;

const getTagsBtn = document.getElementById("get-tags-btn");
const idleState = document.getElementById("idle-state");
const loadingState = document.getElementById("loading-state");
const resultState = document.getElementById("result-state");
const hashtagWell = document.getElementById("hashtag-well");
const copyBtn = document.getElementById("copy-btn");
const resetBtn = document.getElementById("reset-btn");
const toastEl = document.getElementById("toast");
const toastMsg = toastEl.querySelector(".toast-message");
const toastDismiss = document.getElementById("toast-dismiss");

function showState(state) {
  idleState.hidden = state !== "idle";
  loadingState.hidden = state !== "loading";
  resultState.hidden = state !== "result";
}

function showToast(message, type = "info") {
  toastMsg.textContent = message;
  toastEl.className = `toast ${type}`;
  void toastEl.offsetWidth;
  toastEl.classList.add("visible");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove("visible"), 2000);
}

function renderChips() {
  hashtagWell.innerHTML = "";
  for (const tag of hashtagList) {
    const chip = document.createElement("div");
    chip.className = "hashtag-chip";
    chip.innerHTML = `<span class="hashtag-prefix">#</span>${escapeHtml(tag)}`;
    hashtagWell.appendChild(chip);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

getTagsBtn.addEventListener("click", async () => {
  showState("loading");

  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (error) {
    showToast("Tab error: " + error.message, "danger");
    showState("idle");
    return;
  }

  if (!tabs.length) {
    showToast("No active tab found.", "danger");
    showState("idle");
    return;
  }

  let bounds;
  try {
    const scriptResults = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const img = document.querySelector('img[alt="Photo for tag placement"]');
        if (!img) return null;
        const rect = img.getBoundingClientRect();
        return {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          dpr: window.devicePixelRatio || 1,
        };
      },
    });
    bounds = scriptResults?.[0]?.result;
  } catch (error) {
    showToast("Script error: " + error.message, "danger");
    showState("idle");
    return;
  }

  if (!bounds || bounds.w === 0 || bounds.h === 0) {
    showToast("Image not found on this page.", "danger");
    showState("idle");
    return;
  }

  let screenshotUrl;
  try {
    screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "jpeg",
      quality: 92,
    });
  } catch (error) {
    showToast("Screenshot error: " + error.message, "danger");
    showState("idle");
    return;
  }

  let imgBlob;
  try {
    const screenshot = new Image();
    await new Promise((resolve, reject) => {
      screenshot.onload = resolve;
      screenshot.onerror = reject;
      screenshot.src = screenshotUrl;
    });

    const { dpr } = bounds;
    const canvas = document.createElement("canvas");
    canvas.width = bounds.w * dpr;
    canvas.height = bounds.h * dpr;
    canvas
      .getContext("2d")
      .drawImage(
        screenshot,
        bounds.x * dpr, bounds.y * dpr,
        bounds.w * dpr, bounds.h * dpr,
        0, 0,
        canvas.width, canvas.height
      );

    imgBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
  } catch (error) {
    showToast("Crop error: " + error.message, "danger");
    showState("idle");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("image", imgBlob, "image.jpg");

    const uploadRes = await fetch(API_URL, { method: "POST", body: formData });

    if (!uploadRes.ok) {
      let errorMessage = `Server error ${uploadRes.status}`;
      try {
        const responseBody = await uploadRes.json();
        if (responseBody.error) errorMessage = responseBody.error;
      } catch {}
      showToast(errorMessage, "danger");
      showState("idle");
      return;
    }

    const responseData = await uploadRes.json();
    const rawTags = responseData.hashtags ?? "";
    const rawList = Array.isArray(rawTags)
      ? rawTags.map((tag) => tag.trim())
      : String(rawTags).split(/\s+/).map((tag) => tag.trim());

    hashtagList = rawList.map((tag) => tag.replace(/^#+/, "")).filter(Boolean);
    hashtags = hashtagList.map((tag) => `#${tag}`).join(" ");

    renderChips();
    showState("result");
    showToast("Tags generated!", "success");
  } catch (error) {
    showToast("API error: " + error.message, "danger");
    showState("idle");
  }
});

copyBtn.addEventListener("click", async () => {
  if (!hashtags) return;
  try {
    await navigator.clipboard.writeText(hashtags);
    copyBtn.textContent = "COPIED!";
    copyBtn.classList.add("copied");
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copyBtn.textContent = "COPY";
      copyBtn.classList.remove("copied");
      copyTimeout = null;
    }, 1500);
  } catch {
    showToast("Could not access clipboard.", "danger");
  }
});

toastDismiss.addEventListener("click", () => {
  if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
  toastEl.classList.remove("visible");
});

resetBtn.addEventListener("click", () => {
  hashtags = "";
  hashtagList = [];
  if (copyTimeout) { clearTimeout(copyTimeout); copyTimeout = null; }
  copyBtn.textContent = "COPY";
  copyBtn.classList.remove("copied");
  hashtagWell.innerHTML = "";
  showState("idle");
});
