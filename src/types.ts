export type BucketDetails = {
  bucket: string | null;
  bucketPrefix: string | null;
  token: string | null;
};

export type FilesToFetch = { url: string; size: number }[];

export type DownloadStats = {
  totalSeriesCount: number;
  totalSavedSeriesCount: number;
  totalSizeBytes: number;
  totalSavedSizeBytes: number;
  series: string[];
  items: string[];
};

export type InstanceMetadata = Record<
  string,
  {
    vr?: string;
    Value?: unknown[];
    BulkDataURI?: string;
    InlineBinary?: string;
  }
>;

/**
 * Metadata format stored in the metadata.json
 */
export type JsonMetadata = {
  deid_study_uid: string;
  deid_series_uid: string;
  cod: {
    instances: Record<
      string,
      {
        metadata: InstanceMetadata;
        // The metadata will either have url or uri
        uri: string;
        url: string;
        headers: { start_byte: number; end_byte: number };
        offset_tables: {
          CustomOffsetTable?: number[];
          CustomOffsetTableLengths?: number[];
        };
        crc32c: string;
        size: number;
        original_path: string;
        dependencies: string[];
        diff_hash_dupe_paths: [string];
        version: string;
        modified_datetime: string;
      }
    >;
  };
  thumbnail: {
    version: string;
    uri: string;
    thumbnail_index_to_instance_frame: [string, number][];
    instances: Record<
      string,
      {
        frames: {
          thumbnail_index: number;
          anchors: {
            original_size: { width: number; height: number };
            thumbnail_upper_left: { row: number; col: number };
            thumbnail_bottom_right: { row: number; col: number };
          };
        }[];
      }
    >;
  };
};

export type ExtractedTarFile = { name: string; buffer: Uint8Array };

export type ProgressCallbackFn = (props: {
  url: string;
  bytesDownloaded: number;
  bytesTotal: number;
}) => void;

export type DownloadedCallbackFn = (props: {
  url: string;
  size: number;
  file: ArrayBuffer;
}) => void;

export type ExtractedCallbackFn = (props: {
  url: string;
  size: number;
  files: ExtractedTarFile[];
}) => void;

export type SavedCallbackFn = (props: {
  url: string;
  file: ExtractedTarFile;
}) => void;

export type CompletedCallbackFn = (props: { files: FilesToFetch }) => void;

export type ErrorCallbackFn = (props: {
  url?: string;
  size?: number;
  error: Error;
}) => void;
