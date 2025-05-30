import { JsonMetadata } from "../types";

class MetadataManager {
  private metadata = {};

  async getMetadata(url: string, headers: HeadersInit): Promise<JsonMetadata> {
    if (this.metadata[url]) {
      return Promise.resolve(this.metadata[url]);
    }

    const result = await fetch(url, { headers }).then((res) => res.json());
    this.metadata[url] = result;

    return result;
  }
}

const metadataManager = new MetadataManager();
export default metadataManager;
