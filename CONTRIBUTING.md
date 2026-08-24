# Contributing

## Branches

`main` is protected by convention — no direct commits. Every Jira item gets its own branch.

&#x20;   feature/<JIRA-ID>-<short-description>
    chore/<JIRA-ID>-<short-description>
    docs/<JIRA-ID>-<short-description>
    fix/<JIRA-ID>-<short-description>


## Commits

Conventional Commits, with the Jira ID in the scope:

&#x20;   <type>(<JIRA-ID>): <imperative summary>


Types: feat, fix, chore, docs, refactor, test, style, build, ci.

Example: feat(AUTH-1): add user model and registration endpoint

## Cycle

&#x20;   git checkout main
    git pull origin main
    git checkout -b feature/JIRA-ID-description
    # work
    git status
    git diff
    git add <specific files>
    git commit -m "feat(JIRA-ID): summary"
    git push -u origin feature/JIRA-ID-description
    # open PR, self-review, merge


## Rules

* Never `git add .` — stage only the files the ticket touched.
* Never commit `.env`, credentials, or key files.
* Never rewrite history after pushing.
* One Jira item per branch; one logical change per commit.

