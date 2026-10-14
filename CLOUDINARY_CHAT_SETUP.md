# Cloudinary setup for member chat files

Chat images and animated GIFs (JPG, PNG, WebP or GIF) are limited to 10 MB; PDF files are limited to 50 MB. Each message accepts up to three attachments. Files upload from the browser directly to Cloudinary; the API secret stays on the server. The chat message and its attachment metadata remain in PostgreSQL. File-size limits are enforced by the app; Cloudinary upload presets do not provide a per-preset size limit.

Create two **signed** Cloudinary upload presets:

- Image preset: allowed formats `jpg,jpeg,png,webp,gif`.
- PDF preset: allowed format `pdf`.

Leave the preset folder/public ID unset, since the server signs a unique per-member folder and a random public ID. Use the regular public `upload` delivery type so an attachment link can be forwarded and opened by anyone who has it. Do not put the API secret in frontend variables.

Set these variables in the server container's deployment environment:

```text
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_CHAT_IMAGE_PRESET=...
CLOUDINARY_CHAT_PDF_PRESET=...
```

The first three values are in the Cloudinary product environment details. The last two values are the names of the signed presets. Restart/redeploy the app after setting them.
