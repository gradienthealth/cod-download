import untar from "js-untar";
import {
  CompletedCallbackFn,
  DownloadedCallbackFn,
  ErrorCallbackFn,
  ExtractedCallbackFn,
  ExtractedTarFile,
  FilesToFetch,
} from "../types";

class Job {
  private filesToFetch: FilesToFetch;
  private headers: HeadersInit;
  private handleSaving: (
    url: string,
    files: ExtractedTarFile[]
  ) => Promise<void> = () => Promise.resolve();

  private downloadedCallbacks: DownloadedCallbackFn[] = [];
  private extractedCallbacks: ExtractedCallbackFn[] = [];
  private completedCallbacks: CompletedCallbackFn[] = [];
  private errorCallbacks: ErrorCallbackFn[] = [];

  constructor(
    filesToFetch: FilesToFetch,
    headers: HeadersInit,
    handleSaving: (url: string, files: ExtractedTarFile[]) => Promise<void>
  ) {
    this.filesToFetch = filesToFetch;
    this.headers = headers;
    this.handleSaving = handleSaving;
  }

  async start(): Promise<void> {
    await Promise.all(
      this.filesToFetch.map(async ({ url, size }) => {
        let fetchedFile: ArrayBuffer = new ArrayBuffer();
        try {
          fetchedFile = await fetch(url, { headers: this.headers }).then(
            (res) => res.arrayBuffer()
          );

          this.downloadedCallbacks.forEach((callback) => {
            callback({ url, size, file: fetchedFile });
          });
        } catch (error) {
          this.errorCallbacks.forEach((callback) =>
            callback({ url, size, error: error as Error })
          );
        }

        if (fetchedFile.byteLength) {
          let extractedFiles: ExtractedTarFile[];
          try {
            extractedFiles = await this.untarTarFile(fetchedFile);

            await this.handleSaving(url, extractedFiles);

            this.extractedCallbacks.forEach((callback) => {
              callback({ url, size, files: extractedFiles });
            });
          } catch (error) {
            this.errorCallbacks.forEach((callback) =>
              callback({ url, size, error: error as Error })
            );
          }
        }
      })
    );

    try {
      this.completedCallbacks.forEach((callback) => {
        callback({ files: this.filesToFetch });
      });
    } catch (error) {
      this.errorCallbacks.forEach((callback) =>
        callback({ error: error as Error })
      );
    }
  }

  onDownload(callback: DownloadedCallbackFn) {
    this.downloadedCallbacks.push(callback);
  }

  onExtract(callback: ExtractedCallbackFn) {
    this.extractedCallbacks.push(callback);
  }

  onComplete(callback: CompletedCallbackFn) {
    this.completedCallbacks.push(callback);
  }

  onError(callback: ErrorCallbackFn) {
    this.errorCallbacks.push(callback);
  }

  async untarTarFile(arrayBuffer: ArrayBuffer): Promise<ExtractedTarFile[]> {
    return untar(arrayBuffer).catch((error: Error) => {
      console.error("Untar error:", error);
    });
  }
}

export default Job;
