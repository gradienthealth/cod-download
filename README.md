# cod-retrieve

A repo to retrieve/download study DICOM files into a specified local folder.

## Overview

This repository provides functionality to download medical imaging study files (DICOM) from a cloud storage bucket into a local directory. The main class `CodDownload` manages the download process, including initializing the local directory, setting the cloud bucket details, fetching metadata and statistics, and downloading the study files. The actual download job is managed by the `Job` class, which handles file fetching, extraction, saving, and provides callback hooks for monitoring progress.

---

## CodDownload Class Functions

### `initDirectory()`

Prompts the user to select a local directory where the downloaded study files will be saved. It uses the browser's directory picker API to get a writable directory handle. This method also resets the internal file list and download statistics.

### `initBucket(bucketDetails: string | BucketDetails)`

Initializes the cloud storage bucket details. It accepts either a string URL or a `BucketDetails` object containing the bucket name, prefix, and access token. If a string URL is provided, it parses the URL to extract these details and sets the authorization headers accordingly.

The expected input URL string format is like:

```
https://my-domain.com/my-bucket/my-prefix?token=my-token
```

where `my-bucket` is the bucket name, `my-prefix` is the bucket prefix (Only in the string input, the prefix will have a "/dicomweb" added to the prefix and take default prefix "dicomweb" if prefix does not existed. It can be absent, single part or multiparts. Object input will be directly used), and `my-token` is the bearer access token for authorization. The url can have other query params, but the path name should have this format.

Examples for string input:

- https://my-domain.com/my-bucket?token=my-token
- https://my-domain.com/my-bucket/my-prefix?token=my-token
- https://my-domain.com/my-bucket/my-prefix?token=my-token&my-query=something
- https://my-domain.com/my-bucket/my/prefix/parts?token=my-token

Examples for object input:

- ```json
  { "bucket": "my-bucket", "bucketPrefix": null, "token": "my-token" }
  ```
- ```json
  { "bucket": "my-bucket", "bucketPrefix": "my-prefix", "token": "my-token" }
  ```
- ```json
  { "bucket": "my-bucket", "bucketPrefix": "my-prefix/dicomweb", "token": "my-token" }
  ```

### `getStats(studyInstanceUIDs: string[])`

Fetches metadata for the specified study instance UIDs from the cloud bucket, calculates download statistics such as total series count, total size, and how many series are already saved locally. Returns a `DownloadStats` object with this information.

### `download(studyInstanceUIDs: string[], zipOutput?: boolean)`

Starts the download process for the specified study instance UIDs. It first calls `getStats` to prepare the list of files to fetch, then creates and returns a `Job` instance that manages the download and extraction of files.

- If `zipOutput` is `true`, the downloaded files will be zipped for each study and downloaded in default download folder.

---

## Job Class Functions and Callbacks

The `Job` class manages the download and extraction of files. It provides the following key methods:

### `start()`

Begins the download job. It fetches each file by streaming, extracts its contents, saves the files using the provided saving handler, and triggers the registered callbacks for progress, download, extraction, save, completion, and errors.

### Callback Registration Methods

- `onProgress(callback: ProgressCallbackFn)`: Register a callback to be called after each chunk of data is downloaded for each file streaming.
- `onDownload(callback: DownloadedCallbackFn)`: Register a callback to be called after each file is downloaded.
- `onExtract(callback: ExtractedCallbackFn)`: Register a callback to be called after each file is extracted.
- `onSave(callback: SavedCallbackFn)`: Register a callback to be called after each file is saved.
- `onComplete(callback: CompletedCallbackFn)`: Register a callback to be called when the job is completed.
- `onError(callback: ErrorCallbackFn)`: Register a callback to be called if any error occurs during the job.

---

## Example Usage: Downloading a Study

```typescript
import codDownload from "./classes/CodDownload";

async function downloadStudy() {
  // Initialize the local directory to save files
  await codDownload.initDirectory();

  // Initialize the cloud bucket details (can be a URL string or object)
  codDownload.initBucket({
    bucket: "my-bucket",
    bucketPrefix: "my-prefix/with/dicomweb",
    token: "my-token",
  });

  // Specify the study instance UIDs to download
  const studyInstanceUIDs = [
    "1.2.840.113619.2.55.3.604688432.1234.1597851234.1",
  ];

  // Get download statistics
  const stats = await codDownload.getStats(studyInstanceUIDs);
  console.log("Download stats:", stats);

  // Start the download job
  const job = await codDownload.download(studyInstanceUIDs);

  // Register callbacks to monitor progress
  let downloaded = 0;
  job.onProgress(({ url, bytesDownloaded, bytesTotal }) => {
    downloaded += bytesDownloaded;
    console.log(`Downloading ${url}... ${downloaded} / ${bytesTotal} bytes`);
  });

  job.onDownload(({ url, size, file }) => {
    console.log(`Downloaded: ${url} (${size} bytes)`, file);
  });

  job.onExtract(({ url, files }) => {
    console.log(`Extracted files from: ${url}`, files);
  });

  job.onSave(({ url, file }) => {
    console.log(`Saved file: ${url}`, file);
  });

  job.onComplete(() => {
    console.log("Download job completed.");
  });

  job.onError(({ url, error }) => {
    console.error(`Error downloading ${url}:`, error);
  });

  // Start the job
  await job.start();
}

downloadStudy().catch(console.error);
```

---

This setup allows you to download DICOM study files from a cloud bucket into a local directory with progress monitoring and error handling.
