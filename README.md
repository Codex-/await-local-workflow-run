# GitHub Action: await-local-workflow-run

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/codex-/await-local-workflow-run/test.yml?style=flat-square)](https://github.com/Codex-/await-local-workflow-run/actions/workflows/test.yml) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier) [![codecov](https://img.shields.io/codecov/c/github/Codex-/await-local-workflow-run?style=flat-square)](https://codecov.io/gh/Codex-/await-local-workflow-run) [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-await--local--workflow--run-blue.svg?colorA=24292e&colorB=0366d6&style=flat-square&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/await-local-workflow-run)

Await the completion of a local repository workflow before continuing jobs in another workflow.

This action allows you to halt jobs on a workflow in progress, awaiting the completion of another workflow or check in the same repository. For example, if you have a deployment workflow that needs to complete before a test workflow can be run and you do not want or cannot use the GitHub syntax for workflow completion dispatch.

## Usage

```yaml
steps:
  - name: Await the completion of FancyDispatch
    uses: codex-/await-local-workflow-run@v1
    with:
      token: ${{ github.token }} # The standard action GitHub token should be enough to poll the local workflows.
      workflow: fancy-dispatch.yml # filename of the workflow you wish to await
      check_name: deploy # Optional
      timeout_mins: 5 # Default: 15
      poll_interval_ms: 10000 # Default: 15000
```

## Example

Let's say, hypothetically, and definitely not at all the reason I made this action, you have two workflows where one relies on the others completion but you also want the status of the dependant to be represented in the list of checks, like illustrated below.

The workflow `E2E Test` depends on the completion of a check (or the entirety) or the `Deployment` workflow. However if we use the `on` `workflow_run` syntax then we cannot easily represent the check status in the dispatching action like a commit (we all want that little green tick to mean something, right?).

Using `await-local-workflow-run` we can halt the jobs in the workflow `E2E Test` until the completion of the `deploy` check on the `Deployment` workflow.

As a result of this, green checks for everyone, instead of silently failing workflows that are still costing you github action minutes.

```ascii
┌───────────E2E Test───────────┐                   ┌─────Deployment────┐
│                              │                   │                   │
│                              │                   │                   │
│ ┌──────────────────────────┐ │    Await          │    ┌─────────┐    │
│ │                          ├─┼────────────────┐  │    │  Build  │    │
│ │ await-local-workflow-run │ │                │  │    └────┬────┘    │
│ │                          ◄─┼─────────────┐  │  │         │         │
│ └────────────┬─────────────┘ │   Complete  │  │  │         │         │
│              │               │             │  │  │         │         │
│              │               │             │  │  │    ┌────▼─────┐   │
│         ┌────▼────┐          │             │  └──┼────►          │   │
│         │  Tests  │          │             │     │    │  Deploy  │   │
│         └─────────┘          │             └─────┼────┤          │   │
│                              │                   │    └──────────┘   │
└──────────────────────────────┘                   │                   │
                                                   │                   │
                                                   └───────────────────┘
```

### APIs Used

For the sake of transparency please note that this action uses the following API calls:

- Actions
  - [List repository workflows](https://docs.github.com/en/rest/reference/actions#list-repository-workflows)
    - GET `/repos/{owner}/{repo}/actions/workflows`
    - Permissions:
      - `repo`
      - `actions:read`
  - [List workflow runs](https://docs.github.com/en/rest/reference/actions#list-workflow-runs)
    - GET `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs`
    - Permissions:
      - `repo`
  - [Get a workflow run](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)
    - GET `/repos/{owner}/{repo}/actions/runs/{run_id}`
    - Permissions:
      - `repo`
      - `actions:read`
- Checks
  - [List check runs in a check suite](https://docs.github.com/en/rest/checks/runs#list-check-runs-in-a-check-suite)
    - GET `/repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs`
    - Permissions:
      - `repo`
      - `checks:read`
  - [Get a check run](https://docs.github.com/en/rest/checks/runs#get-a-check-run)
    - GET `/repos/{owner}/{repo}/check-runs/{check_run_id}`
    - Permissions:
      - `repo`
      - `checks:read`

## Why not use the `workflow_run` syntax?

While GitHub does provide a way to trigger a workflow run on a specified status of another workflow, it does not reflect in the checks for a given commit.

For example, lets say this is a workflow called deploy:

```yaml
on:
  workflow_run:
    workflows: [Run Tests]
    types:
      - completed
```

The status of this workflow, `deploy`, is only visible in the Actions tab for a repository, and failures are not reflected in the inidivudal thing that triggered it (typically a commit, or pull request).
