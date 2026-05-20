const API_URL = "https://YOUR_AZURE_VM_DOMAIN_OR_IP/api/v1/upload/send";

const copyBtn = document.getElementById("copy-btn");
const tagsEl = document.getElementById("tags");
let tags = "";

document.getElementById("getImages").addEventListener("click", async () => {
  tagsEl.textContent = "Loading...";

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) {
    tagsEl.textContent = "No active tab.";
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const img = document.querySelector('img[alt="Photo for tag placement"]');
        return img ? img.src : null;
      },
    });

    const imgSrc = results?.[0]?.result;
    if (!imgSrc) {
      tagsEl.textContent = "Image not found on this page.";
      return;
    }

    const imgResponse = await fetch(imgSrc);
    if (!imgResponse.ok) throw new Error("Failed to fetch image");
    const imgBlob = await imgResponse.blob();

    const formData = new FormData();
    formData.append("image", imgBlob, "image.jpg");

    const response = await fetch(API_URL, { method: "POST", body: formData });
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    tags = data.hashtags.join(", ");
    tagsEl.textContent = tags;
  } catch (err) {
    console.error(err);
    tagsEl.textContent = "Error generating tags.";
  }
});

copyBtn.addEventListener("click", async () => {
  if (!tags) {
    alert("No tags to copy yet");
    return;
  }
  await navigator.clipboard.writeText(tags);
  alert("Copied!");
});
