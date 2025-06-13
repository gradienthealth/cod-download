import codDownload from "../../classes/CodDownload";
import metadataManager from "../../classes/MetadataManager";
import { JsonMetadata } from "../../types";

jest.mock("js-untar", () => {
  return jest.fn().mockImplementation(() => {
    return Promise.resolve([]);
  });
});

const createTestMetadata = (url: string, errorCase?: boolean): JsonMetadata => {
  const [studyInstanceUID, , seriesInstanceUID] = url
    .split("studies%2F")[1]
    .split("%2F");

  return {
    cod: {
      instances: {
        // @ts-ignore
        "sopUID.1": {
          metadata: {},
          uri: `gs://bucket/prefix/dicomweb/studies/${studyInstanceUID}/series/${seriesInstanceUID}${
            errorCase ? ".error" : ""
          }.tar://instances/sopUID.1.dcm`,
          size: 631,
        },
        // @ts-ignore
        "sopUID.2": {
          metadata: {},
          uri: `gs://bucket/prefix/dicomweb/studies/${studyInstanceUID}/series/${seriesInstanceUID}.tar://instances/sopUID.2.dcm`,
          size: 417,
        },
      },
    },
  };
};

const mockPrefixes = [
  "bucket/prefix/dicomweb/studies/studyUID.1/series/seriesUID.1/",
  "bucket/prefix/dicomweb/studies/studyUID.1/series/seriesUID.2/",
  "bucket/prefix/dicomweb/studies/studyUID.2/series/seriesUID.1/",
  "bucket/prefix/dicomweb/studies/studyUID.2/series/seriesUID.2/",
  "bucket/prefix/dicomweb/studies/studyUID.2/series/seriesUID.3/",
];

describe("CodDownload", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    codDownload.reset();
  });

  it("should resume the download", async () => {
    // mock the fetchStream to throw an error when the string error is in the url
    const fetchFilesMockFn = (allowError: boolean, url: string) => {
      if (allowError && url.includes("error")) {
        // Since we have specified to create metadata of the first two series with error in their url,
        // we can throw error for those two series.
        return Promise.reject(new Error("Fetch error triggered by URL"));
      } else {
        return Promise.resolve(new ArrayBuffer(0));
      }
    };

    global.fetch = jest.fn((url: string) => {
      const studyUID = url.split("studies/")[1].split("/series")[0];
      const prefixes = mockPrefixes.filter((fileUrl) =>
        fileUrl.includes(studyUID)
      );
      return Promise.resolve({
        json: () => Promise.resolve({ prefixes }),
      } as Response);
    }) as jest.Mock;

    // We will mock the metadataManager.getMetadata function to throw an error for first two series
    // by adding the substring error in the url which is used by global.fetch to throw the error.
    let errorCasesLeft = 2;
    const getMetadataSpy = jest
      .spyOn(metadataManager, "getMetadata")
      .mockImplementation((url: string) => {
        return Promise.resolve(createTestMetadata(url, errorCasesLeft-- > 0));
      });

    jest
      .spyOn(codDownload, "getLogs")
      .mockImplementation(() => Promise.resolve());

    const downloadCallback = jest.fn().mockImplementation(({ url }) => {
      const [studyInstanceUID, , seriesInstanceUID] = url
        .split("studies/")[1]
        .split(".tar")[0]
        .split("/");

      ["sopUID.1", "sopUID.2"].forEach((sopInstanceUID) =>
        codDownload["logs"].push(
          codDownload.createLogString(
            studyInstanceUID,
            seriesInstanceUID,
            sopInstanceUID
          )
        )
      );
    });
    const errorCallback = jest.fn();

    const studyUIDs = ["studyUID.1", "studyUID.2"];
    const totalSeries = studyUIDs.flatMap((studyUID) => {
      return mockPrefixes.filter((fileUrl) => fileUrl.includes(studyUID));
    }).length;
    const errorSeries = errorCasesLeft;

    // First time downloading, should trigger error for two, and fetch three
    const job1 = await codDownload.download(studyUIDs);

    jest
      .spyOn(job1, "streamFetchToBuffer")
      .mockImplementation(fetchFilesMockFn.bind(null, true));

    job1.onDownload(downloadCallback);
    job1.onError(errorCallback);
    await job1.start();

    expect(getMetadataSpy).toHaveBeenCalledTimes(totalSeries);
    expect(errorCallback).toHaveBeenCalledTimes(errorSeries);
    expect(downloadCallback).toHaveBeenCalledTimes(totalSeries - errorSeries);

    // Clearing the mock calls.
    getMetadataSpy.mockClear();
    downloadCallback.mockClear();
    errorCallback.mockClear();

    // Second time downloading, should fetch only 2 error cases from first.
    const job2 = await codDownload.download(studyUIDs);

    jest
      .spyOn(job2, "streamFetchToBuffer")
      .mockImplementation(fetchFilesMockFn.bind(null, false));

    job2.onDownload(downloadCallback);
    job2.onError(errorCallback);
    await job2.start();

    const restOfTheSeries = errorSeries;

    expect(getMetadataSpy).toHaveBeenCalledTimes(totalSeries);
    expect(downloadCallback).toHaveBeenCalledTimes(restOfTheSeries);
    expect(errorCallback).toHaveBeenCalledTimes(0);
  });

  it("should resume the extract and saving", async () => {
    // mock the fetchStream to throw an error when the string error is in the url
    const fetchFilesMockFn = (allowError: boolean, url: string) => {
      if (allowError && url.includes("error")) {
        // Since we have specified to create metadata of the first two series with error in their url,
        // we can throw error for those two series.
        return Promise.reject(new Error("Fetch error triggered by URL"));
      } else {
        return Promise.resolve(new ArrayBuffer(10));
      }
    };

    global.fetch = jest.fn((url: string) => {
      const studyUID = url.split("studies/")[1].split("/series")[0];
      const prefixes = mockPrefixes.filter((fileUrl) =>
        fileUrl.includes(studyUID)
      );
      return Promise.resolve({
        json: () => Promise.resolve({ prefixes }),
      } as Response);
    }) as jest.Mock;

    // We will mock the metadataManager.getMetadata function to throw an error for first two series
    // by adding the substring error in the url which is used by codDownload.handleSaving to throw the error.
    let errorCasesLeft = 2;
    const getMetadataSpy = jest
      .spyOn(metadataManager, "getMetadata")
      .mockImplementation((url: string) => {
        return Promise.resolve(createTestMetadata(url, errorCasesLeft-- > 0));
      });

    jest.spyOn(codDownload, "getLogs").mockResolvedValue();
    const handleSavingSpy = jest.spyOn(codDownload, "handleSaving");

    const savedCallback = jest.fn();
    const errorCallback = jest.fn();

    const studyUIDs = ["studyUID.1", "studyUID.2"];
    const totalSeries = studyUIDs.flatMap((studyUID) => {
      return mockPrefixes.filter((fileUrl) => fileUrl.includes(studyUID));
    }).length;
    const errorSeries = errorCasesLeft;

    // First time downloading, should trigger error for two, and fetch three
    const job1 = await codDownload.download(studyUIDs);

    job1.onSave(savedCallback);
    job1.onError(errorCallback);

    jest
      .spyOn(job1, "streamFetchToBuffer")
      .mockImplementation(fetchFilesMockFn.bind(null, true));
    jest.spyOn(job1, "untarTarFile").mockResolvedValue([]);
    handleSavingSpy.mockImplementation((url, files, callbacks) => {
      if (url.includes("error")) {
        // Since we have specified to create metadata of the first two series with error in their url,
        // we can throw error for those two series.
        throw new Error("Error extracting tar file");
      }

      const [studyInstanceUID, , seriesInstanceUID] = url
        .split("studies/")[1]
        .split(".tar")[0]
        .split("/");

      ["sopUID.1", "sopUID.2"].forEach((sopInstanceUID) =>
        codDownload["logs"].push(
          codDownload.createLogString(
            studyInstanceUID,
            seriesInstanceUID,
            sopInstanceUID
          )
        )
      );
      // @ts-ignore
      callbacks.forEach((callback) => callback());
      return Promise.resolve();
    });

    await job1.start();

    expect(getMetadataSpy).toHaveBeenCalledTimes(totalSeries);
    expect(errorCallback).toHaveBeenCalledTimes(errorSeries);
    expect(savedCallback).toHaveBeenCalledTimes(totalSeries - errorSeries);

    // Clearing the mock calls
    getMetadataSpy.mockClear();
    savedCallback.mockClear();
    errorCallback.mockClear();

    const restOfTheSeries = errorSeries;

    // Second time downloading, should fetch only 2 error cases from first
    const job2 = await codDownload.download(["studyUID.1", "studyUID.2"]);
    job2.onSave(savedCallback);
    job2.onError(errorCallback);

    jest
      .spyOn(job2, "streamFetchToBuffer")
      .mockImplementation(fetchFilesMockFn.bind(null, false));
    jest.spyOn(job2, "untarTarFile").mockResolvedValue([]);
    // On the second time, we are not throwing ans errors so that the restOfTheeries can be extracted.
    handleSavingSpy.mockImplementation((url, files, callbacks) => {
      // @ts-ignore
      callbacks.forEach((callback) => callback());
      return Promise.resolve();
    });

    await job2.start();

    expect(getMetadataSpy).toHaveBeenCalledTimes(totalSeries);
    expect(savedCallback).toHaveBeenCalledTimes(restOfTheSeries);
    expect(errorCallback).toHaveBeenCalledTimes(0);
  });
});
