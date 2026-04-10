import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandRoot,
} from "cmdk";
import React from "react";
import "./Command.css";

type CommandRootProps = React.ComponentPropsWithoutRef<typeof CommandRoot> & {
  className?: string;
};

const CommandRootWrapper = React.forwardRef<
  React.ElementRef<typeof CommandRoot>,
  CommandRootProps
>(({ className, ...props }, ref) => {
  return (
    <CommandRoot
      ref={ref}
      className={`flex h-full w-full flex-col overflow-hidden ${className || ""}`}
      {...props}
    />
  );
});

CommandRootWrapper.displayName = "CommandRoot";

type CommandInputProps = React.ComponentPropsWithoutRef<typeof CommandInput> & {
  className?: string;
};

const CommandInputWrapper = React.forwardRef<
  React.ElementRef<typeof CommandInput>,
  CommandInputProps
>(({ className, ...props }, ref) => {
  return <CommandInput ref={ref} className={className} {...props} />;
});

CommandInputWrapper.displayName = "CommandInput";

type CommandListProps = React.ComponentPropsWithoutRef<typeof CommandList> & {
  className?: string;
};

const CommandListWrapper = React.forwardRef<
  React.ElementRef<typeof CommandList>,
  CommandListProps
>(({ className, ...props }, ref) => {
  return (
    <CommandList
      ref={ref}
      className={`overflow-y-auto ${className || ""}`}
      {...props}
    />
  );
});

CommandListWrapper.displayName = "CommandList";

type CommandItemProps = React.ComponentPropsWithoutRef<typeof CommandItem> & {
  className?: string;
};

const CommandItemWrapper = React.forwardRef<
  React.ElementRef<typeof CommandItem>,
  CommandItemProps
>(({ className, ...props }, ref) => {
  return (
    <CommandItem
      ref={ref}
      className={`relative flex cursor-pointer select-none items-center px-3 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent-3 data-[disabled=true]:opacity-50 ${className || ""}`}
      {...props}
    />
  );
});

CommandItemWrapper.displayName = "CommandItem";

type CommandGroupProps = React.ComponentPropsWithoutRef<typeof CommandGroup> & {
  className?: string;
  heading?: string;
};

const CommandGroupWrapper = React.forwardRef<
  React.ElementRef<typeof CommandGroup>,
  CommandGroupProps
>(({ className, heading, children, ...props }, ref) => {
  return (
    <CommandGroup ref={ref} className={`p-1 ${className || ""}`} {...props}>
      {heading && (
        <div className="px-2 py-1.5 text-gray-11" style={{ fontSize: "14px" }}>
          {heading}
        </div>
      )}
      {children}
    </CommandGroup>
  );
});

CommandGroupWrapper.displayName = "CommandGroup";

type CommandEmptyProps = React.ComponentPropsWithoutRef<typeof CommandEmpty> & {
  className?: string;
};

const CommandEmptyWrapper = React.forwardRef<
  React.ElementRef<typeof CommandEmpty>,
  CommandEmptyProps
>(({ className, ...props }, ref) => {
  return (
    <CommandEmpty
      ref={ref}
      className={`py-6 text-center text-sm ${className || ""}`}
      {...props}
    />
  );
});

CommandEmptyWrapper.displayName = "CommandEmpty";

type CommandDialogProps = React.ComponentPropsWithoutRef<
  typeof CommandDialog
> & {
  className?: string;
  contentClassName?: string;
};

const CommandDialogWrapper = ({
  className,
  contentClassName,
  children,
  ...props
}: CommandDialogProps) => {
  return (
    <CommandDialog
      label="Command menu"
      className={className}
      contentClassName={`command-dialog-content ${contentClassName || ""}`}
      overlayClassName="command-dialog-overlay"
      {...props}
    >
      {children}
    </CommandDialog>
  );
};

CommandDialogWrapper.displayName = "CommandDialog";

export const Command = {
  Root: CommandRootWrapper,
  Dialog: CommandDialogWrapper,
  Input: CommandInputWrapper,
  List: CommandListWrapper,
  Item: CommandItemWrapper,
  Group: CommandGroupWrapper,
  Empty: CommandEmptyWrapper,
};
