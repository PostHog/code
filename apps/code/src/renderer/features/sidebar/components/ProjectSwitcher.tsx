import {
  useLogoutMutation,
  useSelectProjectMutation,
} from "@features/auth/hooks/authMutations";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { Command } from "@features/command/components/Command";
import { useProjects } from "@features/projects/hooks/useProjects";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import {
  ArrowSquareOut,
  Check,
  DiscordLogo,
  FolderSimple,
  Gear,
  Info,
  Keyboard,
  Plus,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import { Box, Dialog, Flex, Text } from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/utils/urls";
import { isMac } from "@utils/platform";
import { useState } from "react";
import "./ProjectSwitcher.css";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
  Kbd,
} from "@posthog/quill";
import { ChevronRightIcon } from "lucide-react";

export function ProjectSwitcher() {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const selectProjectMutation = useSelectProjectMutation();
  const logoutMutation = useLogoutMutation();
  const { groupedProjects, currentProject, currentProjectId, currentUser } =
    useProjects();

  const handleProjectSelect = (projectId: number) => {
    if (projectId !== currentProjectId) {
      selectProjectMutation.mutate(projectId);
    }
    setPopoverOpen(false);
    setDialogOpen(false);
  };

  const handleCreateProject = async () => {
    if (cloudRegion) {
      const cloudUrl = getCloudUrlFromRegion(cloudRegion);
      await trpcClient.os.openExternal.mutate({
        url: `${cloudUrl}/organization/create-project`,
      });
    }
    setPopoverOpen(false);
  };

  const handleAllProjects = () => {
    setPopoverOpen(false);
    setDialogOpen(true);
  };

  const openSettings = useSettingsDialogStore((s) => s.open);

  const handleSettings = () => {
    setPopoverOpen(false);
    openSettings();
  };

  const handleKeyboardShortcuts = () => {
    setPopoverOpen(false);
    openSettings("shortcuts");
  };

  const handleOpenExternal = async (url: string) => {
    await trpcClient.os.openExternal.mutate({ url });
    setPopoverOpen(false);
  };

  const handleDiscord = async () => {
    await trpcClient.os.openExternal.mutate({
      url: "https://discord.gg/c3qYyJXSWp",
    });
    setPopoverOpen(false);
  };

  const handleLogout = () => {
    setPopoverOpen(false);
    logoutMutation.mutate();
  };

  return (
    <>
      <DropdownMenu open={popoverOpen} onOpenChange={setPopoverOpen}>
        <DropdownMenuTrigger
          render={
            <Item
              size="xs"
              className="border-border hover:bg-fill-hover aria-expanded:bg-fill-active"
            >
              <ItemContent className="select-none">
                <ItemTitle>
                  {currentProject?.name ?? "No project selected"}
                </ItemTitle>
                <ItemDescription>
                  {currentUser?.email ?? "No email"}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="size-4 rotate-270 group-aria-expanded/item:rotate-90" />
              </ItemActions>
            </Item>
          }
        />

        <DropdownMenuContent
          align="start"
          side="bottom"
          className="w-(--anchor-width) max-w-(--anchor-width) pt-0"
          sideOffset={4}
        >
          <Box>
            <Box className="-mx-1 mb-1 border-border border-b">
              {currentUser ? (
                <Item className="p-2">
                  <ItemContent>
                    <ItemTitle>
                      {currentUser.first_name && (
                        <span>
                          {currentUser.first_name}
                          {currentUser.last_name && ` ${currentUser.last_name}`}
                        </span>
                      )}
                    </ItemTitle>
                    <ItemDescription>{currentUser.email}</ItemDescription>
                  </ItemContent>
                </Item>
              ) : (
                <>
                  <Box className="mt-1 h-3.5 w-20 animate-pulse rounded bg-gray-6" />
                  <Box className="mt-1 h-3 w-32 animate-pulse rounded bg-gray-5" />
                </>
              )}
            </Box>

            <Box className="flex flex-col gap-px">
              <DropdownMenuItem onClick={handleAllProjects}>
                <FolderSimple size={14} className="text-gray-11" />
                Change project
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handleCreateProject}>
                <Plus size={14} className="text-gray-11" />
                Create project
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleDiscord}>
                <DiscordLogo size={14} className="text-gray-11" />
                Join our Discord
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Info size={14} className="text-gray-11" />
                  Learn more
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent side="right" sideOffset={4}>
                  <DropdownMenuItem
                    onClick={() =>
                      handleOpenExternal("https://posthog.com/code")
                    }
                  >
                    <ArrowSquareOut size={14} className="text-gray-11" />
                    PostHog Code Website
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      handleOpenExternal("https://posthog.com/privacy")
                    }
                  >
                    <ShieldCheck size={14} className="text-gray-11" />
                    Privacy Policy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleKeyboardShortcuts}>
                    <Keyboard size={14} className="text-gray-11" />
                    Keyboard Shortcuts
                    <DropdownMenuShortcut>
                      <Kbd>{isMac ? "⌘/" : "Ctrl+/"}</Kbd>
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem onClick={handleSettings}>
                <Gear size={14} className="text-gray-11" />
                Settings
                <DropdownMenuShortcut>
                  <Kbd>{isMac ? "⌘," : "Ctrl+,"}</Kbd>
                </DropdownMenuShortcut>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleLogout}>
                <SignOut size={14} className="text-gray-11" />
                Log out
              </DropdownMenuItem>
            </Box>
          </Box>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectPickerDialogInner
        dialogOpen={dialogOpen}
        setDialogOpen={setDialogOpen}
        groupedProjects={groupedProjects}
        currentProjectId={currentProjectId}
        currentProject={currentProject}
        handleProjectSelect={handleProjectSelect}
      />
    </>
  );
}

interface ProjectPickerDialogInnerProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  groupedProjects: ReturnType<typeof useProjects>["groupedProjects"];
  currentProjectId: number | null;
  currentProject: { id: number; name: string } | undefined;
  handleProjectSelect: (projectId: number) => void;
}

function ProjectPickerDialogInner({
  dialogOpen,
  setDialogOpen,
  groupedProjects,
  currentProjectId,
  currentProject,
  handleProjectSelect,
}: ProjectPickerDialogInnerProps) {
  const defaultValue = currentProject
    ? `${currentProject.name} ${currentProject.id}`
    : undefined;
  const [highlightedValue, setHighlightedValue] = useState(defaultValue);

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (open) {
          setHighlightedValue(defaultValue);
        }
      }}
    >
      <Dialog.Content
        className="project-picker-dialog"
        style={{ maxWidth: 600, padding: 0 }}
      >
        <Command.Root
          shouldFilter={true}
          label="Project picker"
          value={highlightedValue}
          onValueChange={setHighlightedValue}
        >
          <Command.Input placeholder="Search projects..." autoFocus={true} />
          <Command.List>
            <Command.Empty>No projects found.</Command.Empty>
            {groupedProjects.flatMap((group) =>
              group.projects.map((project) => (
                <Command.Item
                  key={project.id}
                  value={`${project.name} ${project.id}`}
                  onSelect={() => handleProjectSelect(project.id)}
                >
                  <Flex align="center" justify="between" width="100%">
                    <Text size="1">{project.name}</Text>
                    {project.id === currentProjectId && (
                      <Check size={14} className="text-accent-11" />
                    )}
                  </Flex>
                </Command.Item>
              )),
            )}
          </Command.List>
        </Command.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
}
