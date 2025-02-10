import * as core from "@actions/core";
import * as github from "@actions/github";
import type { Context } from "@actions/github/lib/context.ts";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import {
  getCheckId,
  getRunState,
  getRunStatus,
  getWorkflowId,
  getWorkflowRun,
  getWorkflowRuns,
  init,
  resetGetWorkflowRunCfg,
  RunConclusion,
  RunStatus,
  RunType,
} from "./api.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";

vi.mock("@actions/core");
let mockedContext: Context = {} as any;
vi.mock("@actions/github", () => ({
  get context() {
    return mockedContext;
  },
  getOctokit: vi.fn(),
}));

interface MockResponse {
  data: any;
  status: number;
}

const mockOctokit = {
  rest: {
    checks: {
      get: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listForSuite: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
    actions: {
      getWorkflowRun: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listRepoWorkflows: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listWorkflowRuns: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
  },
};

describe("API", () => {
  const { coreDebugLogMock, coreErrorLogMock, assertOnlyCalled } =
    mockLoggingFunctions();

  const mockBranchName = "lanayru";
  const mockRef = `refs/heads/${mockBranchName}`;
  const mockSha = "1234567890123456789012345678901234567890";

  function mockContextProp(prop: "ref", value: string): void;
  function mockContextProp(prop: "repo", value: Record<string, string>): void;
  function mockContextProp(prop: "sha", value: string): void;
  function mockContextProp(
    prop: "ref" | "repo" | "sha",
    value: string | Record<string, string>,
  ): void {
    Object.defineProperty(mockedContext, prop, {
      value,
      writable: true,
    });
  }

  beforeEach(() => {
    vi.spyOn(core, "getInput").mockReturnValue("");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(github, "getOctokit").mockReturnValue(mockOctokit as any);
    mockContextProp("ref", mockRef);
    mockContextProp("repo", {
      owner: "rich-clown",
      repo: "circus",
    });
    mockContextProp("sha", mockSha);

    init();
  });

  afterEach(() => {
    mockedContext = {} as any;
    vi.resetAllMocks();
  });

  describe("getWorkflowId", () => {
    const mockData = {
      total_count: 3,
      workflows: [
        {
          id: 0,
          path: ".github/workflows/cake.yml",
        },
        {
          id: 1,
          path: ".github/workflows/pie.yml",
        },
        {
          id: 2,
          path: ".github/workflows/slice.yml",
        },
      ],
    };

    it("should return the workflow ID for a given workflow filename", async () => {
      const listRepoWorkflowsMock = vi
        .spyOn(mockOctokit.rest.actions, "listRepoWorkflows")
        .mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

      const getWorkflowRunIdPromise = getWorkflowId("slice.yml");

      // Behaviour
      await expect(getWorkflowRunIdPromise).resolves.toStrictEqual(
        mockData.workflows[2]?.id,
      );
      expect(listRepoWorkflowsMock).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflows:
          Repository: rich-clown/circus
          Total Workflows: 3
          Workflows: [cake.yml (0), pie.yml (1), slice.yml (2)]"
      `);
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      const listRepoWorkflowsMock = vi
        .spyOn(mockOctokit.rest.actions, "listRepoWorkflows")
        .mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus,
          }),
        );

      const getWorkflowRunIdPromise = getWorkflowId("implode");

      // Behaviour
      await expect(
        getWorkflowRunIdPromise,
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Failed to get Workflows, expected 200 but received 401]`,
      );
      expect(listRepoWorkflowsMock).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
        `"getWorkflowId: An unexpected error has occurred: Failed to get Workflows, expected 200 but received 401"`,
      );
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
    });

    it("should throw if a given workflow name cannot be found in the response", async () => {
      const workflowName = "spoon";
      const listRepoWorkflowsMock = vi
        .spyOn(mockOctokit.rest.actions, "listRepoWorkflows")
        .mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

      const getWorkflowRunIdPromise = getWorkflowId(workflowName);

      // Behaviour
      await expect(
        getWorkflowRunIdPromise,
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Failed to get Workflow ID for 'spoon', available workflows: [cake.yml (0), pie.yml (1), slice.yml (2)]]`,
      );
      expect(listRepoWorkflowsMock).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock, coreErrorLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflows:
          Repository: rich-clown/circus
          Total Workflows: 3
          Workflows: [cake.yml (0), pie.yml (1), slice.yml (2)]"
      `);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
        `"getWorkflowId: An unexpected error has occurred: Failed to get Workflow ID for 'spoon', available workflows: [cake.yml (0), pie.yml (1), slice.yml (2)]"`,
      );
    });

    it("should throw if the response returns no workflows", async () => {
      const workflowName = "slice";
      const listRepoWorkflowsMock = vi
        .spyOn(mockOctokit.rest.actions, "listRepoWorkflows")
        .mockReturnValue(
          Promise.resolve({
            data: {
              total_count: 0,
              workflows: [],
            },
            status: 200,
          }),
        );

      const getWorkflowRunIdPromise = getWorkflowId(workflowName);

      // Behaviour
      await expect(
        getWorkflowRunIdPromise,
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Failed to get Workflow ID for 'slice', available workflows: []]`,
      );
      expect(listRepoWorkflowsMock).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock, coreErrorLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflows:
          Repository: rich-clown/circus
          Total Workflows: 0
          Workflows: []"
      `);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
        `"getWorkflowId: An unexpected error has occurred: Failed to get Workflow ID for 'slice', available workflows: []"`,
      );
    });
  });

  describe("getWorkflowRun", () => {
    beforeEach(() => {
      resetGetWorkflowRunCfg();
    });

    it("should return a run ID", async () => {
      const mockWorkflowRunsApiData = [
        {
          id: 123456,
          check_suite_id: 654321,
          head_sha: "1234567890123456789012345678901234567890",
          run_attempt: 1,
          status: RunStatus.InProgress,
        },
      ];
      const listWorkflowRunsMock = vi
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValue(
          Promise.resolve({
            data: {
              total_count: mockWorkflowRunsApiData.length,
              workflow_runs: mockWorkflowRunsApiData,
            },
            status: 200,
          }),
        );

      const getWorkflowRunPromise = getWorkflowRun(0);

      // Behaviour
      await expect(getWorkflowRunPromise).resolves.not.toThrow();
      const run = await getWorkflowRunPromise;
      expect(run).toStrictEqual({
        id: mockWorkflowRunsApiData[0]?.id,
        attempt: mockWorkflowRunsApiData[0]?.run_attempt,
        checkSuiteId: mockWorkflowRunsApiData[0]?.check_suite_id,
        status: mockWorkflowRunsApiData[0]?.status,
      });
      expect(listWorkflowRunsMock).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [123456 (Attempt 1)]"
      `);
      expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(`
        "Workflow Run ID Found:
          Workflow ID: 0
          Run ID: 123456
          Run Attempt: 1
          Run Check Suite ID: 654321
          Run Status: in_progress"
      `);
    });

    it("should return undefined if it cannot find an ID", async () => {
      const mockWorkflowRunsApiData = [
        {
          id: 123456,
          check_suite_id: 654321,
          head_sha: "0", // different sha
          run_attempt: 1,
          status: RunStatus.InProgress,
        },
      ];
      const listWorkflowRunsSpy = vi
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValue(
          Promise.resolve({
            data: {
              total_count: mockWorkflowRunsApiData.length,
              workflow_runs: mockWorkflowRunsApiData,
            },
            status: 200,
          }),
        );

      const getWorkflowRunPromise = getWorkflowRun(0);

      // Behaviour
      await expect(getWorkflowRunPromise).resolves.not.toThrow();
      const run = await getWorkflowRunPromise;
      expect(run).toBeUndefined();
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: []"
      `);
    });

    it("should change to use the branch strategy if no runs are returned for a given ID", async () => {
      const mockWorkflowRunsApiData = [
        {
          id: 123456,
          check_suite_id: 654321,
          head_sha: "1234567890123456789012345678901234567890",
          run_attempt: 1,
          status: RunStatus.InProgress,
        },
      ];
      const listWorkflowRunsSpy = vi
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValueOnce(
          Promise.resolve({
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          }),
        )
        .mockReturnValueOnce(
          Promise.resolve({
            data: {
              total_count: mockWorkflowRunsApiData.length,
              workflow_runs: mockWorkflowRunsApiData,
            },
            status: 200,
          }),
        );

      const getWorkflowRunPromise = getWorkflowRun(0);

      // Behaviour
      await expect(getWorkflowRunPromise).resolves.not.toThrow();
      const run = await getWorkflowRunPromise;
      expect(run).toBeUndefined();
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      expect(Object.keys(listWorkflowRunsSpy.mock.calls[0]?.[0])).not.toContain(
        "branch",
      );
      expect(await getWorkflowRun(0)).toStrictEqual({
        id: mockWorkflowRunsApiData[0]?.id,
        attempt: mockWorkflowRunsApiData[0]?.run_attempt,
        checkSuiteId: mockWorkflowRunsApiData[0]?.check_suite_id,
        status: mockWorkflowRunsApiData[0]?.status,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      expect(Object.keys(listWorkflowRunsSpy.mock.calls[1]?.[0])).toContain(
        "branch",
      );

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(4);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: []"
      `);
      expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRunIds: Filtered branch name: refs/heads/lanayru"`,
      );
      expect(coreDebugLogMock.mock.calls[2]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [123456 (Attempt 1)]"
      `);
      expect(coreDebugLogMock.mock.calls[3]?.[0]).toMatchInlineSnapshot(`
        "Workflow Run ID Found:
          Workflow ID: 0
          Run ID: 123456
          Run Attempt: 1
          Run Check Suite ID: 654321
          Run Status: in_progress"
      `);
    });
  });

  describe("getWorkflowRuns", () => {
    const mockWorkflowRunsApiData = [
      {
        id: 0,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 1,
        status: RunStatus.Completed,
      },
      {
        id: 1,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 0,
        status: RunStatus.Completed,
      },
      {
        id: 2,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 2,
        status: RunStatus.Completed,
      },
      {
        id: 3,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 3,
        status: RunStatus.Completed,
      },
      {
        id: 4,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 1,
        status: RunStatus.Completed,
      },
      {
        id: 9,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 3,
        status: RunStatus.Queued,
      },
      {
        id: 5,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 4,
        status: RunStatus.Completed,
      },
      {
        id: 6,
        head_sha: "0",
        run_attempt: 5,
        status: RunStatus.Completed,
      },
      {
        id: 7,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 2,
        status: RunStatus.InProgress,
      },
      {
        id: 8,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 6,
        status: RunStatus.Completed,
      },
      {
        id: 9,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 2,
        status: RunStatus.Queued,
      },
    ];
    const mockData = {
      total_count: mockWorkflowRunsApiData.length,
      workflow_runs: mockWorkflowRunsApiData,
    };

    let listWorkflowRunsSpy: MockInstance<
      typeof mockOctokit.rest.actions.listWorkflowRuns
    >;

    beforeEach(() => {
      listWorkflowRunsSpy = vi
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it("should get the run IDs for a given workflow ID filtered by the commit sha", async () => {
      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRuns = await getWorkflowRunsPromise;
      expect(workflowRuns).toHaveLength(
        mockWorkflowRunsApiData.filter(
          (workflow) => workflow.head_sha === mockSha,
        ).length,
      );
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });

    it("should have the highest run attempt first", async () => {
      const runAttempt = mockWorkflowRunsApiData
        .filter((workflow) => workflow.head_sha === mockSha)
        .reduce((previousValue, currentValue) => {
          return previousValue > currentValue.run_attempt
            ? previousValue
            : currentValue.run_attempt;
        }, 0);

      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRuns = await getWorkflowRunsPromise;
      expect(workflowRuns[0]?.attempt).toStrictEqual(runAttempt);
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });

    it("should return the runs in attempt order", async () => {
      const runAttempts = mockWorkflowRunsApiData
        .filter((workflow) => workflow.head_sha === mockSha)
        .sort((a, b) => {
          if (a.run_attempt > b.run_attempt) {
            return -1;
          }
          if (a.run_attempt < b.run_attempt) {
            return 1;
          }

          return 0;
        });

      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRuns = await getWorkflowRunsPromise;
      expect(workflowRuns).toHaveLength(runAttempts.length);
      runAttempts.forEach((attempt, i) => {
        const workflowRun = workflowRuns[i];
        expect(workflowRun?.attempt).toStrictEqual(attempt.run_attempt);
        expect(workflowRun?.checkSuiteId).toStrictEqual(attempt.check_suite_id);
        expect(workflowRun?.id).toStrictEqual(attempt.id);
        expect(workflowRun?.status).toStrictEqual(attempt.status);
      });
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });

    it("should return runs in the correct shape", async () => {
      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRun = (await getWorkflowRunsPromise)[0];
      expect(typeof workflowRun?.attempt).toStrictEqual("number");
      expect(typeof workflowRun?.checkSuiteId).toStrictEqual("number");
      expect(typeof workflowRun?.id).toStrictEqual("number");
      expect(typeof workflowRun?.status).toStrictEqual("string");
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
         "Fetched Workflow Runs:
           Repository: rich-clown/circus
           Workflow ID: 0
           Triggering SHA: 1234567890123456789012345678901234567890
           Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
       `);
    });

    it("should not try to use the branch name by default", async () => {
      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRun = (await getWorkflowRunsPromise)[0];
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();
      const requestObj = listWorkflowRunsSpy.mock.calls[0]?.[0];
      expect(workflowRun).toBeDefined();
      expect(requestObj.branch).toBeUndefined();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });

    it("should use the branch name for the request if tryBranchName is true", async () => {
      const getWorkflowRunsPromise = getWorkflowRuns(0, true);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRun = (await getWorkflowRunsPromise)[0];
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();
      const requestObj = listWorkflowRunsSpy.mock.calls[0]?.[0];
      expect(workflowRun).toBeDefined();
      expect(requestObj.branch).toStrictEqual(mockBranchName);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRunIds: Filtered branch name: refs/heads/lanayru"`,
      );
      expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });

    it("should use the created field if the branch name is not being used", async () => {
      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRun = (await getWorkflowRunsPromise)[0];
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();
      const requestObj = listWorkflowRunsSpy.mock.calls[0]?.[0];
      expect(workflowRun).toBeDefined();
      expect(requestObj.created).toBeDefined();
      expect(typeof requestObj.created).toStrictEqual("string");
      expect(requestObj.created !== "").toBeTruthy();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });

    it("should exclude the created field if the branch name is being used", async () => {
      const getWorkflowRunsPromise = getWorkflowRuns(0, true);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRun = (await getWorkflowRunsPromise)[0];
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();
      const requestObj = listWorkflowRunsSpy.mock.calls[0]?.[0];
      expect(workflowRun).toBeDefined();
      expect(requestObj.created).toBeUndefined();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRunIds: Filtered branch name: refs/heads/lanayru"`,
      );
      expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });

    it("should return no runs if there are no sha matches", async () => {
      mockContextProp("sha", "ganon");

      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRuns = await getWorkflowRunsPromise;
      expect(workflowRuns).toHaveLength(0);
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: ganon
          Runs Fetched: []"
      `);
    });

    it("should throw if a non-200 status is returned", async () => {
      listWorkflowRunsSpy.mockRestore();
      const errorStatus = 401;
      listWorkflowRunsSpy = vi
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus,
          }),
        );

      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      await expect(getWorkflowRunsPromise).rejects.toThrow(
        `Failed to get Workflow runs, expected 200 but received ${errorStatus}`,
      );
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRuns: An unexpected error has occurred: Failed to get Workflow runs, expected 200 but received 401"`,
      );
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
    });

    it("should return an empty array if there are no runs", async () => {
      listWorkflowRunsSpy.mockRestore();

      listWorkflowRunsSpy = vi
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValue(
          Promise.resolve({
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          }),
        );

      const getWorkflowRunsPromise = getWorkflowRuns(0);

      // Behaviour
      const runs = await getWorkflowRunsPromise;
      expect(runs).toStrictEqual([]);
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: []"
      `);
    });

    it("should not use the branch field if the ref is for a tag", async () => {
      mockContextProp("ref", "/refs/tags/1.5.0");

      const getWorkflowRunsPromise = getWorkflowRuns(0, true);

      // Behaviour
      await expect(getWorkflowRunsPromise).resolves.not.toThrow();
      const workflowRun = (await getWorkflowRunsPromise)[0];
      expect(listWorkflowRunsSpy).toHaveBeenCalledOnce();
      const requestObj = listWorkflowRunsSpy.mock.calls[0]?.[0];
      expect(workflowRun).toBeDefined();
      expect(requestObj.branch).toBeUndefined();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unable to filter branch, unsupported ref: /refs/tags/1.5.0"`,
      );
      expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(`
        "Fetched Workflow Runs:
          Repository: rich-clown/circus
          Workflow ID: 0
          Triggering SHA: 1234567890123456789012345678901234567890
          Runs Fetched: [9 (Attempt 3), 7 (Attempt 2), 9 (Attempt 2), 4 (Attempt 1), 1 (Attempt 0)]"
      `);
    });
  });

  describe("getCheckId", () => {
    it("should return a run ID", async () => {
      const mockCheckRunsApiData = [
        {
          id: 123456,
          name: "ganon",
        },
      ];
      vi.spyOn(mockOctokit.rest.checks, "listForSuite").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: mockCheckRunsApiData.length,
            check_runs: mockCheckRunsApiData,
          },
          status: 200,
        }),
      );
      const runID = await getCheckId(0, "ganon");

      expect(runID).toStrictEqual(123456);
    });

    it("should throw an error if it cannot locate the requested check name", async () => {
      const mockCheckRunsApiData = [
        {
          id: 123456,
          name: "ganon",
        },
      ];
      vi.spyOn(mockOctokit.rest.checks, "listForSuite").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: mockCheckRunsApiData.length,
            check_runs: mockCheckRunsApiData,
          },
          status: 200,
        }),
      );

      await expect(() => getCheckId(0, "link")).rejects.toThrowError(
        "Failed to get Check ID for 'link', available checks: [ganon (123456)]",
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.checks, "listForSuite").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }),
      );

      await expect(getCheckId(0, "")).rejects.toThrow(
        `Failed to get Checks, expected 200 but received ${errorStatus}`,
      );
    });
  });

  describe("getRunState", () => {
    it("should throw if an unknown run type is specified", async () => {
      await expect(() =>
        getRunState(123456, -1 as RunType),
      ).rejects.toThrowError("Unknown run type specified");
    });

    describe("workflow", () => {
      it("should return the run state for a given run ID", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

        const state = await getRunState(123456, RunType.WorkflowRun);
        expect(state.conclusion).toStrictEqual(mockData.conclusion);
        expect(state.status).toStrictEqual(mockData.status);
      });

      it("should throw if a non-200 status is returned", async () => {
        const errorStatus = 401;
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus,
          }),
        );

        await expect(getRunState(0, RunType.WorkflowRun)).rejects.toThrow(
          `Failed to get run state, expected 200 but received ${errorStatus}`,
        );
      });
    });

    describe("check", () => {
      it("should return the run state for a given run ID", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

        const state = await getRunState(123456, RunType.WorkflowRun);
        expect(state.conclusion).toStrictEqual(mockData.conclusion);
        expect(state.status).toStrictEqual(mockData.status);
      });

      it("should throw if a non-200 status is returned", async () => {
        const errorStatus = 401;
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus,
          }),
        );

        await expect(getRunState(0, RunType.WorkflowRun)).rejects.toThrow(
          `Failed to get run state, expected 200 but received ${errorStatus}`,
        );
      });
    });
  });

  describe("getRunStatus", () => {
    describe("workflow", () => {
      it("should return the conclusion when completed", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

        const runStatus = await getRunStatus(0, RunType.WorkflowRun);

        expect(runStatus.completed).toBeTruthy();
        if (runStatus.completed) {
          expect(runStatus.conclusion).toStrictEqual(RunConclusion.Cancelled);
        } else {
          throw new Error("should be completed");
        }
      });

      it("should not set a failure status if the conclusion is a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Success,
        };
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );
        const coreSetFailedSpy = vi
          .spyOn(core, "setFailed")
          .mockImplementation(() => undefined);

        await getRunStatus(0, RunType.WorkflowRun);

        expect(coreSetFailedSpy).not.toBeCalled();
      });

      it("should set the status to non-success when the conclusion is not a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Failure,
        };
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );
        const coreSetFailedSpy = vi
          .spyOn(core, "setFailed")
          .mockImplementation(() => undefined);

        await getRunStatus(0, RunType.WorkflowRun);

        expect(coreSetFailedSpy.mock.calls[0]?.[0]).toStrictEqual(
          RunConclusion.Failure,
        );
      });

      it("should set the status to non-success when the conclusion is unknown", async () => {
        const unknownStatus = "Clown Car?";
        const mockData = {
          status: RunStatus.Completed,
          conclusion: unknownStatus,
        };
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );
        const coreSetFailedSpy = vi
          .spyOn(core, "setFailed")
          .mockImplementation(() => undefined);

        await getRunStatus(0, RunType.WorkflowRun);

        expect(coreSetFailedSpy.mock.calls[0]?.[0]).toStrictEqual(
          `Unknown conclusion: ${unknownStatus}`,
        );
      });

      it("should return with completed set to false when not completed", async () => {
        const mockData = {
          status: RunStatus.Queued,
        };
        vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

        const runStatus = await getRunStatus(0, RunType.WorkflowRun);

        expect(runStatus.completed).toBeFalsy();
        if (runStatus.completed) {
          throw new Error("should be not be completed");
        }
      });
    });

    describe("check", () => {
      it("should return the conclusion when completed", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        vi.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

        const runStatus = await getRunStatus(0, RunType.CheckRun);

        expect(runStatus.completed).toBeTruthy();
        if (runStatus.completed) {
          expect(runStatus.conclusion).toStrictEqual(RunConclusion.Cancelled);
        } else {
          throw new Error("should be completed");
        }
      });

      it("should not set a failure status if the conclusion is a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Success,
        };
        vi.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );
        const coreSetFailedSpy = vi
          .spyOn(core, "setFailed")
          .mockImplementation(() => undefined);

        await getRunStatus(0, RunType.CheckRun);

        expect(coreSetFailedSpy).not.toBeCalled();
      });

      it("should set the status to non-success when the conclusion is not a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Failure,
        };
        vi.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );
        const coreSetFailedSpy = vi
          .spyOn(core, "setFailed")
          .mockImplementation(() => undefined);

        await getRunStatus(0, RunType.CheckRun);

        expect(coreSetFailedSpy.mock.calls[0]?.[0]).toStrictEqual(
          RunConclusion.Failure,
        );
      });

      it("should set the status to non-success when the conclusion is unknown", async () => {
        const unknownStatus = "Clown Car?";
        const mockData = {
          status: RunStatus.Completed,
          conclusion: unknownStatus,
        };
        vi.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );
        const coreSetFailedSpy = vi
          .spyOn(core, "setFailed")
          .mockImplementation(() => undefined);

        await getRunStatus(0, RunType.CheckRun);

        expect(coreSetFailedSpy.mock.calls[0]?.[0]).toStrictEqual(
          `Unknown conclusion: ${unknownStatus}`,
        );
      });

      it("should return with completed set to false when not completed", async () => {
        const mockData = {
          status: RunStatus.Queued,
        };
        vi.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          }),
        );

        const runStatus = await getRunStatus(0, RunType.CheckRun);

        expect(runStatus.completed).toBeFalsy();
        if (runStatus.completed) {
          throw new Error("should be not be completed");
        }
      });
    });
  });
});
