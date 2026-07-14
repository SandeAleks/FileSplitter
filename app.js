let outputDirectory = null;

let activeSplitter = null;
let isCancelled = false;

// UI
const folderButton = document.getElementById("outputFolderBtn");
const folderLabel = document.getElementById("outputFolderLabel");

const progress = document.getElementById("progress");
const status = document.getElementById("status");

const startBtn = document.getElementById("startBtn");
const cancelBtn = document.getElementById("cancelBtn");

const replaceFromInput = document.getElementById("replaceFrom");
const replaceToInput = document.getElementById("replaceTo");

// -----------------------------
// Folder picker
// -----------------------------
folderButton.addEventListener("click", async () => {

    if (!window.showDirectoryPicker) {
        alert("Use Chrome or Edge.");
        return;
    }

    outputDirectory = await window.showDirectoryPicker();
    folderLabel.textContent = outputDirectory.name;

});

// -----------------------------
// Cancel button
// -----------------------------
cancelBtn.addEventListener("click", () => {

    if (activeSplitter) {

        isCancelled = true;
        activeSplitter.cancel();

        status.textContent = "Cancelling...";

    }

});

// -----------------------------
// Start splitting
// -----------------------------
startBtn.addEventListener("click", async () => {

    const file = document.getElementById("inputFile").files[0];

    if (!file) return alert("Select file first");
    if (!outputDirectory) return alert("Select output folder");

    const replaceFrom = replaceFromInput.value;
    const replaceTo = replaceToInput.value;
    const encoding = document.getElementById("encoding").value;

    const maxSizeMB =
        Number(document.getElementById("maxSize").value || 500);

    const regexText =
        document.getElementById("regex").value.trim();

    const mode =
        document.querySelector('input[name="mode"]:checked').value;

    // reset state
    isCancelled = false;
    progress.value = 0;

    startBtn.disabled = true;
    cancelBtn.disabled = false;

    status.textContent = "Starting...";

    try {

        activeSplitter = new FileSplitter(
            file,
            outputDirectory,
            maxSizeMB,
            regexText,
            mode,
            updateProgress,
            encoding,
            replaceFrom,
            replaceTo
        );

        await activeSplitter.split();

        if (!isCancelled) {
            status.textContent = "Done ✔";
            progress.value = 100;
        } else {
            status.textContent = "Cancelled";
        }

    } catch (err) {

        console.error(err);
        status.textContent = "Error occurred";
        alert(err.message);

    } finally {

        startBtn.disabled = false;
        cancelBtn.disabled = true;
        activeSplitter = null;

    }

});

// -----------------------------
function updateProgress(percent, message) {

    progress.value = percent;
    status.textContent = message;

}