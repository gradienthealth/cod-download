import Job from "./Job";
import {
  BucketDetails,
  DownloadStats,
  ExtractedTarFile,
  FilesToFetch,
  JsonMetadata,
} from "../types";
import metadataManager from "./MetadataManager";

class CodDownload {
  private directoryHandle!: FileSystemDirectoryHandle;
  private logs: string[] = [];
  private bucketDetails: BucketDetails = {
    bucket: null,
    bucketPrefix: null,
    token: null,
  };
  private headers: HeadersInit = {};
  private metadata: { metadata: JsonMetadata; saved: boolean }[] = [];
  private filesToFetch: FilesToFetch = [];
  private stats: DownloadStats = {
    totalSeriesCount: 0,
    totalSavedSeriesCount: 0,
    totalSizeBytes: 0,
    totalSavedSizeBytes: 0,
    items: [],
  };

  async initDirectory(): Promise<void> {
    try {
      // @ts-ignore
      this.directoryHandle = await window.showDirectoryPicker({
        mode: "readwrite",
      });

      this.filesToFetch = [];
      this.stats = {
        totalSeriesCount: 0,
        totalSavedSeriesCount: 0,
        totalSizeBytes: 0,
        totalSavedSizeBytes: 0,
        items: [],
      };
    } catch (error) {
      this.handleError(
        "CodDownload: Error initializing directory: ",
        error as Error
      );
    }
  }

  initBucket(bucketDetails: string | BucketDetails): void {
    if (typeof bucketDetails === "string") {
      this.parseBucketDetails(bucketDetails);
    } else {
      this.bucketDetails = bucketDetails;
    }
  }

  async getStats(
    studyInstanceUIDs: string[]
  ): Promise<DownloadStats | undefined> {
    try {
      await this.getLogs();
      await this.fetchStudyMetadata(studyInstanceUIDs);
      this.calculateStats();

      return this.stats;
    } catch (error) {
      this.handleError("CodDownload: Error getting stats: ", error as Error);
    }
  }

  async download(studyInstanceUIDs: string[]): Promise<Job> {
    await this.getStats(studyInstanceUIDs);

    const job = new Job(
      this.filesToFetch,
      this.headers,
      this.handleSaving.bind(this)
    );

    return job;
  }

  async getLogs() {
    try {
      const logFileHandle = await this.directoryHandle.getFileHandle(
        "log.json"
      );
      if (logFileHandle) {
        const file = await logFileHandle.getFile();
        const contents = JSON.parse(await file.text());
        this.logs = contents.logs;
      }
    } catch (error) {
      console.warn(
        "CodDownload: Error getting logs file handle: " +
          (error as Error).message
      );
    }
  }

  parseBucketDetails(bucketDetails: string): void {
    const url = new URL(bucketDetails);
    const pathParts = url.pathname.split("/");
    const bucket = pathParts[2];
    const bucketPrefix = pathParts.slice(3).join("/");
    const params = url.searchParams;
    const token = params.get("token");

    this.bucketDetails = {
      bucket,
      bucketPrefix: bucketPrefix ? `${bucketPrefix}/dicomweb` : "dicomweb",
      token,
    };
    this.headers = {
      Authorization: `Bearer ${token}`,
    };
  }

  async fetchStudyMetadata(studyInstanceUIDs: string[]) {
    const { bucket, bucketPrefix } = this.bucketDetails;

    const studyPromises: Promise<any>[] = studyInstanceUIDs
      .map(async (studyInstanceUID) => {
        const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${bucketPrefix}/studies/${studyInstanceUID}/series/&delimiter=/`;
        try {
          const data = await fetch(url, { headers: this.headers }).then((res) =>
            res.json()
          );

          const seriesPromises = (data.prefixes || [])
            .map(async (prefix: string) => {
              const seriesInstanceUID = prefix
                .split("/series/")[1]
                .split("/")[0];

              try {
                const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(
                  prefix + "metadata.json"
                )}?alt=media`;
                const metadata = await metadataManager.getMetadata(
                  metadataUrl,
                  this.headers
                );

                let saved = false;
                if (this.logs.length) {
                  saved = Object.keys(metadata.cod.instances).every(
                    (sopInstanceUID) => {
                      const logString = this.createLogString(
                        studyInstanceUID,
                        seriesInstanceUID,
                        sopInstanceUID
                      );

                      return this.logs.includes(logString);
                    }
                  );
                }

                return {
                  metadata,
                  saved,
                };
              } catch (error) {
                console.warn(
                  `CodDownload: Error fetching medatata.json for series ${seriesInstanceUID}:`,
                  error
                );
                return null;
              }
            })
            .filter(Boolean);

          return (await Promise.all(seriesPromises)).filter(
            (seriesMetadata) =>
              Object.values(seriesMetadata.metadata.cod?.instances)?.length
          );
        } catch (error) {
          this.handleError(
            "CodDownload: Error fetching study details: ",
            error as Error
          );
          return null;
        }
      })
      .filter(Boolean);

    await Promise.all(studyPromises).then((studies) => {
      this.metadata = studies.filter((series) => series.length).flat();
    });
  }

  calculateStats(): void {
    const { bucket, bucketPrefix } = this.bucketDetails;

    this.stats.totalSeriesCount = this.metadata.length;
    this.filesToFetch = [];

    this.metadata.forEach(({ metadata, saved }) => {
      let sizeBytes = 0;
      Object.values(metadata.cod.instances).forEach((instance) => {
        sizeBytes += instance.size;
      });
      const instance = Object.values(metadata.cod.instances)[0];

      if (saved) {
        this.stats.totalSavedSizeBytes += sizeBytes;
        this.stats.totalSizeBytes += sizeBytes;
        this.stats.totalSavedSeriesCount++;
        return;
      }

      const url =
        `https://storage.googleapis.com/${bucket}/` +
        `${bucketPrefix ? bucketPrefix + "/" : ""}studies/` +
        instance.uri.split("studies/")[1].split("://")[0];

      this.filesToFetch.push({
        url,
        size: sizeBytes,
      });
      this.stats.totalSizeBytes += sizeBytes;
    });

    this.stats.items = this.filesToFetch.map(({ url }) =>
      url.split("studies/")[1].replaceAll("/", "/ ")
    );
  }

  async handleSaving(url: string, files: ExtractedTarFile[]) {
    try {
      const [studyInstanceUID, , seriesInstanceUID] = url
        .split("studies/")[1]
        .split(".tar")[0]
        .split("/");

      const studyHandle = await this.directoryHandle.getDirectoryHandle(
        studyInstanceUID,
        { create: true }
      );
      const seriesHandle = await studyHandle.getDirectoryHandle(
        seriesInstanceUID,
        { create: true }
      );
      const instancesHandle = await seriesHandle.getDirectoryHandle(
        "instances",
        { create: true }
      );

      await Promise.all(
        files.map(async ({ name, buffer }) => {
          try {
            const fileName =
              name.split("/").at(-1) || `instance${Math.random() * 10000}`;
            const blob = new Blob([buffer], {
              type: "application/dicom",
            });

            const fileHandle = await instancesHandle.getFileHandle(fileName, {
              create: true,
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            this.logs.push(
              this.createLogString(
                studyInstanceUID,
                seriesInstanceUID,
                fileName.split(".dcm")[0]
              )
            );
          } catch (error) {
            console.warn(
              `CodDownload: Error writing the file ${seriesInstanceUID}/${name}:`,
              error
            );
          }
        })
      );
    } catch (error) {
      this.handleError(
        `CodDownload: Error Writing series ${url}: `,
        error as Error
      );
    } finally {
      const logFileHandle = await this.directoryHandle.getFileHandle(
        "log.json",
        { create: true }
      );
      const logWritable = await logFileHandle.createWritable();
      await logWritable.write(JSON.stringify({ logs: this.logs }));
      await logWritable.close();
    }
  }

  createLogString(
    studyInstanceUID: string,
    seriesInstanceUID: string,
    sopInstanceUID: string
  ): string {
    return `${studyInstanceUID}/${seriesInstanceUID}/${sopInstanceUID}`;
  }

  parseUIDs(url: string): {
    studyInstanceUID: string;
    seriesInstanceUID: string;
  } {
    const urlParts = url.split("studies/")[1].split("/");
    return { studyInstanceUID: urlParts[0], seriesInstanceUID: urlParts[2] };
  }

  private handleError(message: string, error: Error): Error {
    const customError = new Error(message + error.message);
    console.warn(message, error);
    throw customError;
  }

  reset(): void {
    this.logs = [];
    this.bucketDetails = {
      bucket: null,
      bucketPrefix: null,
      token: null,
    };
    this.metadata = [];
    this.filesToFetch = [];
    this.stats = {
      totalSeriesCount: 0,
      totalSavedSeriesCount: 0,
      totalSizeBytes: 0,
      totalSavedSizeBytes: 0,
      items: [],
    };
  }
}

const codDownload = new CodDownload();
export default codDownload;
