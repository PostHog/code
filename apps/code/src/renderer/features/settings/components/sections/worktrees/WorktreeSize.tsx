import { Skeleton } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const size = bytes / 1024 ** i;
  return `${size.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

interface WorktreeSizeProps {
  worktreePath: string;
}

export function WorktreeSize({ worktreePath }: WorktreeSizeProps) {
  const { data, isLoading } = trpcReact.workspace.getWorktreeSize.useQuery(
    { worktreePath },
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return (
      <>
        {" - "}
        <Skeleton
          style={{ width: "50px", height: "12px", display: "inline-block" }}
        />
      </>
    );
  }

  if (!data) return null;

  return <> - {formatSize(data.sizeBytes)}</>;
}
