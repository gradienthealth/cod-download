import untar from "js-untar";
import {
  CompletedCallbackFn,
  DownloadedCallbackFn,
  ErrorCallbackFn,
  ExtractedCallbackFn,
  ExtractedTarFile,
  FilesToFetch,
  SavedCallbackFn,
} from "../types";

class Job {
  private filesToFetch: FilesToFetch;
  private headers: HeadersInit;
  private handleSaving: (
    url: string,
    files: ExtractedTarFile[],
    callbacks: SavedCallbackFn[]
  ) => Promise<void> = () => Promise.resolve();
  private handleZipping?: () => Promise<void>;

  private downloadedCallbacks: DownloadedCallbackFn[] = [];
  private extractedCallbacks: ExtractedCallbackFn[] = [];
  private savedCallbacks: SavedCallbackFn[] = [];
  private completedCallbacks: CompletedCallbackFn[] = [];
  private errorCallbacks: ErrorCallbackFn[] = [];

  constructor(
    filesToFetch: FilesToFetch,
    headers: HeadersInit,
    handleSaving: (
      url: string,
      files: ExtractedTarFile[],
      callbacks: SavedCallbackFn[]
    ) => Promise<void>,
    handleZipping?: () => Promise<void>
  ) {
    this.filesToFetch = filesToFetch;
    this.headers = headers;
    this.handleSaving = handleSaving;
    this.handleZipping = handleZipping;
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

            this.extractedCallbacks.forEach((callback) => {
              callback({ url, size, files: extractedFiles });
            });

            await this.handleSaving(url, extractedFiles, this.savedCallbacks);
          } catch (error) {
            this.errorCallbacks.forEach((callback) =>
              callback({ url, size, error: error as Error })
            );
          }
        }
      })
    );

    try {
      if (this.handleZipping) {
        await this.handleZipping();
      }
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

  onSave(callback: SavedCallbackFn) {
    this.savedCallbacks.push(callback);
  }

  onComplete(callback: CompletedCallbackFn) {
    this.completedCallbacks.push(callback);
  }

  onError(callback: ErrorCallbackFn) {
    this.errorCallbacks.push(callback);
  }

  async untarTarFile(arrayBuffer: ArrayBuffer): Promise<ExtractedTarFile[]> {
    return untar(arrayBuffer).catch((error: Error) => {
      throw new Error("Untar error:", error);
    });
  }
}

export default Job;
