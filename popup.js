// Remove unnecessary comments and clean up code
const extensionAPI = (typeof chrome !== "undefined" && chrome) || (typeof browser !== "undefined" && browser);
const targetBrowser = "__TARGET_BROWSER__";
const storagePrefix = "__STORAGE_PREFIX__";
const legacyStorageKey = "searchHistory";
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearButton = document.getElementById("clearButton");
const historyList = document.getElementById("historyList");
const historySection = document.getElementById("history");
const historyHeading = historySection.querySelector("h4");

function getStorageKey(key) {
  return `${storagePrefix}${key}`;
}

function getStoredHistory() {
  const prefixedHistory = localStorage.getItem(getStorageKey(legacyStorageKey));
  if (prefixedHistory) {
    return JSON.parse(prefixedHistory);
  }

  const legacyHistory = localStorage.getItem(legacyStorageKey);
  if (legacyHistory) {
    const parsedHistory = JSON.parse(legacyHistory);
    localStorage.setItem(getStorageKey(legacyStorageKey), legacyHistory);
    localStorage.removeItem(legacyStorageKey);
    return parsedHistory;
  }

  return [];
}

function applyLocalization() {
  document.title = extensionAPI.i18n.getMessage("popupTitle");
  searchInput.placeholder = extensionAPI.i18n.getMessage("searchPlaceholder");
  searchButton.textContent = extensionAPI.i18n.getMessage("searchButton");
  clearButton.textContent = extensionAPI.i18n.getMessage("clearButton");
  historyHeading.textContent = extensionAPI.i18n.getMessage("searchHistory");
}

// Load search history from localStorage
function loadHistory() {
  const history = getStoredHistory();
  historyList.innerHTML = "";

  if (history.length > 0) {
    historySection.style.display = "flex";
    document.body.style.height = "280px";
    history.forEach((query, index) => {
      const li = document.createElement("li");
      li.textContent = query.length > 35 ? query.substring(0, 35) + "..." : query;
      li.title = query;
      li.style.animation = `fadeIn 0.3s ease-out ${index * 0.1}s forwards`;
      li.style.opacity = 0;
      li.addEventListener("click", () => {
        searchInput.value = query;
        performSearch(query);
      });
      historyList.appendChild(li);
    });
  } else {
    historySection.style.display = "none";
    document.body.style.height = "180px";
  }
}

// Save query to localStorage
function saveToHistory(query) {
  let history = getStoredHistory();
  if (!history.includes(query)) {
    history.push(query);
    if (history.length > 3) history.shift();
    localStorage.setItem(getStorageKey(legacyStorageKey), JSON.stringify(history));
  }
}

// Perform YouTube search
function performSearch(query) {
  if (query) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    extensionAPI.tabs.create({ url });
    saveToHistory(query);
    loadHistory();
    searchInput.value = "";
  } else {
    alert(extensionAPI.i18n.getMessage("searchQueryPrompt"));
  }
}

// Event Listeners
searchButton.addEventListener("click", () => {
  performSearch(searchInput.value.trim());
});

searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") performSearch(searchInput.value.trim());
});

clearButton.addEventListener("click", () => {
  searchInput.value = "";
});

// Auto-focus input field when popup opens
document.addEventListener("DOMContentLoaded", () => {
  applyLocalization();
  searchInput.focus();
  loadHistory();
});
