import {
  type Environment,
  slugifyEnvironmentName,
} from "@main/services/environment/schemas";
import type { RegisteredFolder } from "@main/services/folders/schemas";
import { ArrowLeft, Plus, Trash } from "@phosphor-icons/react";
import {
  Box,
  Button,
  Flex,
  IconButton,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc";
import { useTRPC } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@utils/toast";
import { useCallback, useState } from "react";

interface ActionFormState {
  key: string;
  name: string;
  command: string;
  icon?: string;
}

let nextActionKey = 0;
function createActionKey(): string {
  return `action-${++nextActionKey}`;
}

interface EnvironmentFormProps {
  folder: RegisteredFolder;
  environment?: Environment;
  onBack: () => void;
}

export function EnvironmentForm({
  folder,
  environment,
  onBack,
}: EnvironmentFormProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isNew = !environment;

  const [name, setName] = useState(environment?.name ?? folder.name);
  const [setupScript, setSetupScript] = useState(
    environment?.setup?.script ?? "",
  );
  const [actions, setActions] = useState<ActionFormState[]>(
    environment?.actions?.map((a) => ({
      key: createActionKey(),
      name: a.name,
      command: a.command,
      icon: a.icon,
    })) ?? [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const slug = slugifyEnvironmentName(name.trim());
  const filename = slug ? `${slug}.toml` : "<name>.toml";
  const filePath = `${folder.path}/.posthog-code/environments/${filename}`;

  const handleAddAction = useCallback(() => {
    setActions((prev) => [
      ...prev,
      { key: createActionKey(), name: "", command: "" },
    ]);
  }, []);

  const handleRemoveAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateAction = useCallback(
    (index: number, field: keyof ActionFormState, value: string) => {
      setActions((prev) =>
        prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
      );
    },
    [],
  );

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSaving(true);
    try {
      const setup = setupScript.trim()
        ? { script: setupScript.trim() }
        : undefined;

      const validActions = actions
        .filter((a) => a.name.trim() && a.command.trim())
        .map((a) => ({
          name: a.name.trim(),
          command: a.command.trim(),
          icon: a.icon,
        }));

      if (isNew) {
        await trpcClient.environment.create.mutate({
          repoPath: folder.path,
          name: name.trim(),
          setup,
          actions: validActions,
        });
        toast.success("Environment created");
      } else {
        await trpcClient.environment.update.mutate({
          repoPath: folder.path,
          id: environment.id,
          name: name.trim(),
          setup,
          actions: validActions,
        });
        toast.success("Environment updated");
      }

      await queryClient.invalidateQueries(trpc.environment.list.pathFilter());
      onBack();
    } catch {
      toast.error(`Failed to ${isNew ? "create" : "update"} environment`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew || !environment) return;
    const confirmed = window.confirm(
      `Delete environment "${environment.name}"? This will remove the TOML file from disk.`,
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await trpcClient.environment.delete.mutate({
        repoPath: folder.path,
        id: environment.id,
      });
      toast.success("Environment deleted");
      await queryClient.invalidateQueries(trpc.environment.list.pathFilter());
      onBack();
    } catch {
      toast.error("Failed to delete environment");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Flex direction="column" gap="4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-mono text-[11px] text-gray-11 hover:text-gray-12"
      >
        <ArrowLeft size={10} />
        <span>Back to projects</span>
      </button>

      <Text size="1" weight="medium">
        {isNew ? "Creating" : "Editing"} environment for {folder.name}
      </Text>

      <Flex direction="column" gap="1">
        <Text size="1" weight="medium">
          Name
        </Text>
        <TextField.Root
          size="1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Environment name"
          spellCheck={false}
        />
      </Flex>

      <Flex direction="column" gap="1">
        <Text size="1" weight="medium">
          Setup script
        </Text>
        <Text size="1" color="gray" className="text-[11px]">
          Runs in the project root on worktree creation.
        </Text>
        <TextArea
          size="1"
          value={setupScript}
          onChange={(e) => setSetupScript(e.target.value)}
          placeholder={"# e.g.\npnpm install\npnpm run build"}
          rows={4}
          spellCheck={false}
          style={{ fontFamily: "monospace", fontSize: 11 }}
        />
      </Flex>

      <Flex direction="column" gap="2">
        <Flex align="center" justify="between">
          <Text size="1" weight="medium">
            Actions
          </Text>
          <Button
            variant="outline"
            color="gray"
            size="1"
            onClick={handleAddAction}
          >
            <Plus size={10} />
            Add action
          </Button>
        </Flex>
        <Text size="1" color="gray" className="text-[11px]">
          Custom commands displayed in the task header.
        </Text>

        {actions.length === 0 ? (
          <Box
            px="2"
            py="2"
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-2)",
            }}
          >
            <Text size="1" color="gray">
              No actions yet.
            </Text>
          </Box>
        ) : (
          <Flex direction="column" gap="2">
            {actions.map((action, index) => (
              <Box
                key={action.key}
                px="2"
                py="2"
                style={{
                  border: "1px solid var(--gray-5)",
                  borderRadius: "var(--radius-2)",
                }}
              >
                <Flex direction="column" gap="2">
                  <Flex align="center" justify="between">
                    <Text size="1" weight="medium">
                      Action {index + 1}
                    </Text>
                    <IconButton
                      variant="ghost"
                      color="red"
                      size="1"
                      onClick={() => handleRemoveAction(index)}
                    >
                      <Trash size={12} />
                    </IconButton>
                  </Flex>
                  <Flex direction="column" gap="1">
                    <Text size="1" color="gray">
                      Name
                    </Text>
                    <TextField.Root
                      size="1"
                      value={action.name}
                      onChange={(e) =>
                        handleUpdateAction(index, "name", e.target.value)
                      }
                      placeholder="e.g. Build"
                      spellCheck={false}
                    />
                  </Flex>
                  <Flex direction="column" gap="1">
                    <Text size="1" color="gray">
                      Command
                    </Text>
                    <TextArea
                      size="1"
                      value={action.command}
                      onChange={(e) =>
                        handleUpdateAction(index, "command", e.target.value)
                      }
                      placeholder="e.g. pnpm run build"
                      rows={2}
                      spellCheck={false}
                      style={{ fontFamily: "monospace", fontSize: 11 }}
                    />
                  </Flex>
                </Flex>
              </Box>
            ))}
          </Flex>
        )}
      </Flex>

      <Text size="1" color="gray" className="text-[11px]">
        Environment will be stored at {filePath}
      </Text>

      <Flex justify="between">
        {!isNew ? (
          <Button
            size="1"
            variant="outline"
            color="red"
            onClick={handleDelete}
            disabled={isDeleting || isSaving}
          >
            <Trash size={12} />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        ) : (
          <div />
        )}
        <Button size="1" onClick={handleSave} disabled={isSaving || isDeleting}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </Flex>
    </Flex>
  );
}
