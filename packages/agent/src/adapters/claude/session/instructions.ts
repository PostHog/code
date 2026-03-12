const BRANCH_NAMING = `
# Branch Naming

When working in a detached HEAD state, create a descriptive branch name based on the work being done before committing. Do this automatically without asking the user.
`;

const PLAN_MODE = `
# Plan Mode

Only enter plan mode (EnterPlanMode) when the user is requesting a significant change in approach or direction mid-task. Do NOT enter plan mode for:
- Confirmations or approvals ("yes", "looks good", "continue", "go ahead")
- Minor clarifications or small adjustments
- Answers to questions you asked (unless you are still in the initial planning phase and have not yet started executing)
- Feedback that does not require replanning

When in doubt, continue executing and incorporate the feedback inline.
`;

export const APPENDED_INSTRUCTIONS = BRANCH_NAMING + PLAN_MODE;
