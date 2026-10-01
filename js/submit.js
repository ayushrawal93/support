function initAssignmentForm() {
const fields = document.querySelectorAll("#assignment-form .live-input");
fields.forEach(function (field) {
function updateStatus() {
const wrapper = field.closest(".live-field");
if (!wrapper) return;
const status = wrapper.querySelector(".field-status");
if (!status) return;
if (field.value && String(field.value).trim() !== "") {
status.innerHTML = '<i class="fas fa-check-circle"></i>';
status.style.color = "#22c55e";
wrapper.classList.add("field-valid");
} else {
status.innerHTML = '<i class="fas fa-circle"></i>';
status.style.color = "#cbd5e1";
wrapper.classList.remove("field-valid");
}
}
field.addEventListener("focus", function () {
const wrapper = this.closest(".live-field");
if (wrapper) wrapper.classList.add("field-active");
});
field.addEventListener("blur", function () {
const wrapper = this.closest(".live-field");
if (wrapper) wrapper.classList.remove("field-active");
});
field.addEventListener("input", updateStatus);
field.addEventListener("change", updateStatus);
});
const deadlineDate = document.getElementById("deadlineDate");
const deadlineTime = document.getElementById("deadlineTime");
function getLocalDate() {
const now = new Date();
return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
if (deadlineDate) {
deadlineDate.min = getLocalDate();
deadlineDate.addEventListener("change", function () {
if (this.value && this.value < getLocalDate()) {
this.value = getLocalDate();
this.setCustomValidity("Please select today or a future date.");
} else {
this.setCustomValidity("");
}
});
}
const fileInput = document.getElementById("assignmentFile");
const fileUploadBox = document.getElementById("fileUploadBox");
const fileUploadTitle = document.getElementById("fileUploadTitle");
const fileUploadHint = document.getElementById("fileUploadHint");
const attachmentList = document.getElementById("attachmentList");
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 20;
let selectedFiles = [];
function fileIcon(file) {
const type = (file.type || "").toLowerCase();
const name = file.name.toLowerCase();
if (type.includes("pdf") || name.endsWith(".pdf")) return "fa-file-pdf";
if (type.includes("word") || /\.(doc|docx)$/.test(name)) return "fa-file-word";
if (type.includes("sheet") || type.includes("excel") || /\.(xls|xlsx)$/.test(name)) return "fa-file-excel";
if (type.includes("presentation") || /\.(ppt|pptx)$/.test(name)) return "fa-file-powerpoint";
if (type.startsWith("image/")) return "fa-file-image";
if (type.startsWith("video/")) return "fa-file-video";
if (type.startsWith("audio/")) return "fa-file-audio";
if (type.includes("zip") || type.includes("compressed") || /\.(zip|rar|7z|tar|gz)$/.test(name)) return "fa-file-archive";
if (type.includes("text") || /\.(txt|md|rtf)$/.test(name)) return "fa-file-alt";
return "fa-file";
}
function formatFileSize(bytes) {
if (bytes < 1024) return `${bytes} B`;
if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function escapeHtml(value) {
return String(value).replace(/[&<>"']/g, function (char) {
return ({
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#39;"
})[char];
});
}
// FormData is populated explicitly at submit time, so there is no need to
// clone every selected File into extra hidden file inputs. This avoids a costly
// DataTransfer/FileList rebuild on every attachment change.
function renderAttachments() {
if (!attachmentList) return;
attachmentList.innerHTML = "";
selectedFiles.forEach(function (file, index) {
const row = document.createElement("div");
row.className = "attachment-item";
row.innerHTML = `
<span class="attachment-file-icon"><i class="fas ${fileIcon(file)}"></i></span>
<span class="attachment-file-info">
<strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
<small>${escapeHtml(file.type || "File")} • ${formatFileSize(file.size)}</small>
</span>
<button type="button" class="attachment-remove" data-index="${index}" aria-label="Delete ${escapeHtml(file.name)}" title="Delete file">
<i class="fas fa-trash-alt"></i>
</button>
`;
attachmentList.appendChild(row);
});
const count = selectedFiles.length;
if (fileUploadBox) fileUploadBox.classList.toggle("file-attached", count > 0);
if (fileUploadTitle) {
fileUploadTitle.textContent = count
? `${count} attachment${count === 1 ? "" : "s"} ready`
: "Attach Assignment";
}
if (fileUploadHint) {
fileUploadHint.textContent = count
? `${count} file${count === 1 ? "" : "s"} selected • Click to add more`
: "Click to choose files";
}
}

/* Attach the listeners once, outside renderAttachments(). */
if (fileInput) {
fileInput.addEventListener("change", function () {
const incoming = Array.from(this.files || []);
const rejected = [];
incoming.forEach(function (file) {
if (file.size > MAX_FILE_SIZE) {
rejected.push(`${file.name} (over 20 MB)`);
return;
}
if (selectedFiles.length >= MAX_FILES) {
rejected.push(`${file.name} (20-file limit reached)`);
return;
}
const duplicate = selectedFiles.some(function (existing) {
return existing.name === file.name &&
existing.size === file.size &&
existing.lastModified === file.lastModified;
});
if (!duplicate) selectedFiles.push(file);
});
if (rejected.length) {
alert("These files were not added:\n\n" + rejected.join("\n"));
}
/* Clear native picker so the same file can be selected again. */
this.value = "";
renderAttachments();
});
}
if (attachmentList) {
attachmentList.addEventListener("click", function (event) {
const button = event.target.closest(".attachment-remove");
if (!button) return;
event.preventDefault();
event.stopPropagation();
const index = Number(button.dataset.index);
if (!Number.isInteger(index) || index < 0 || index >= selectedFiles.length) return;
selectedFiles.splice(index, 1);
renderAttachments();
});
}
/* =====================================================
LOCAL BACKEND FORM SUBMISSION
Same-origin: /api/submissions
No FormSubmit/FormBold/static-form provider is used.
===================================================== */
const form = document.getElementById("assignment-form");
const submitButton = document.getElementById("ctcBtn");
/* =====================================================
ORDER ID
AH + HHMM + DD + MM + YY (visitor local time)
Example: 2:18 PM on 09/09/2026 -> AH1418090926
===================================================== */
function generateOrderId(date) {
const d = date || new Date();
const hhmm = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
const day = String(d.getDate()).padStart(2, "0");
const month = String(d.getMonth() + 1).padStart(2, "0");
const year = String(d.getFullYear()).slice(-2);
return `AH${hhmm}${day}${month}${year}`;
}
if (form) {
form.addEventListener("submit", async function (event) {
event.preventDefault();
if (deadlineDate && deadlineTime) {
if (!deadlineDate.value || !deadlineTime.value) {
alert("Please select your assignment deadline date and time.");
return;
}
}
if (!form.checkValidity()) {
form.reportValidity();
return;
}
// Generate the customer-facing Order ID at the moment submission starts.
const orderId = generateOrderId(new Date());
const oldHtml = submitButton ? submitButton.innerHTML : "";
if (submitButton) {
submitButton.disabled = true;
submitButton.innerHTML =
'<span class="submit-icon"><i class="fas fa-spinner fa-spin"></i></span>' +
'<span>Sending...</span>';
}
try {
/*
 * Build the multipart body explicitly.
 * This avoids relying on the browser's native file input state after
 * the picker has been cleared by the attachment UI.
 */
const data = new FormData();

new FormData(form).forEach(function (value, key) {
if (key !== "assignmentFiles" &&
    key !== "assignmentFilePicker" &&
    key !== "assignmentFile") {
data.append(key, value);
}
});

data.set("order_id", orderId);

selectedFiles.forEach(function (file) {
data.append("assignmentFiles", file, file.name);
});

const response = await fetch("/api/submissions", {
method: "POST",
body: data,
headers: {
"Accept": "application/json"
}
});
let result = {};
try {
result = await response.json();
} catch {
throw new Error("The server returned an invalid response.");
}
if (!response.ok || !result.success) {
throw new Error(result.message || "Unable to submit the assignment.");
}
form.reset();
selectedFiles.length = 0;
renderAttachments();
const success = document.getElementById("ctcOk");
if (success) {
success.style.display = "block";
success.innerHTML =
'<i class="fas fa-check-circle"></i>' +
'<p>Thanks! Your Requirements Was Submitted. Your Order # <strong>' +
(result.orderId || orderId) + '</strong></p>';
success.scrollIntoView({
behavior: "smooth",
block: "center"
});
} else {
alert("Thanks! Your Requirements Was Submitted. Your Order # " + (result.orderId || orderId));
}
} catch (error) {
console.error("Local backend submission error:", error);
alert(error.message || "Unable to submit the assignment. Please try again.");
} finally {
if (submitButton) {
submitButton.disabled = false;
submitButton.innerHTML = oldHtml;
}
}
});
}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAssignmentForm, { once: true });
} else {
  initAssignmentForm();
}
