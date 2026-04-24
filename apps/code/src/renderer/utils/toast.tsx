import { CheckIcon, InfoIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { Card, Flex, IconButton, Spinner, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  id: string | number;
  type: "loading" | "success" | "error" | "info" | "warning";
  title: ReactNode;
  description?: string;
  action?: ToastAction;
}

function ToastComponent(props: ToastProps) {
  const { id, type, title, description, action } = props;

  const getIcon = () => {
    switch (type) {
      case "loading":
        return <Spinner size="1" />;
      case "success":
        return <CheckIcon size={16} weight="bold" color="var(--green-9)" />;
      case "error":
        return <XIcon size={16} weight="bold" color="var(--red-9)" />;
      case "info":
        return <InfoIcon size={16} weight="bold" color="var(--blue-9)" />;
      case "warning":
        return <WarningIcon size={16} weight="bold" color="var(--amber-9)" />;
    }
  };

  return (
    <Card size="2">
      <Flex gap="3" align="start">
        <Flex
          style={{
            paddingTop: "2px",
            flexShrink: 0,
          }}
        >
          {getIcon()}
        </Flex>
        <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
          <Flex align="center" justify="between" gap="2">
            <Text className="font-medium text-[13px] leading-5">{title}</Text>
            <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
              {action && (
                <Text
                  color="blue"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    action.onClick();
                    sonnerToast.dismiss(id);
                  }}
                  className="font-medium text-[13px] leading-5"
                >
                  {action.label}
                </Text>
              )}
              {type !== "loading" && (
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  onClick={() => sonnerToast.dismiss(id)}
                >
                  <XIcon size={12} />
                </IconButton>
              )}
            </Flex>
          </Flex>
          {description && (
            <Text
              color="gray"
              style={{ wordBreak: "break-word" }}
              className="text-[13px] leading-5"
            >
              {description}
            </Text>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

export const toast = {
  loading: (title: ReactNode, description?: string) => {
    return sonnerToast.custom((id) => (
      <ToastComponent
        id={id}
        type="loading"
        title={title}
        description={description}
      />
    ));
  },

  success: (
    title: ReactNode,
    options?: {
      description?: string;
      id?: string | number;
      action?: ToastAction;
    },
  ) => {
    return sonnerToast.custom(
      (id) => (
        <ToastComponent
          id={id}
          type="success"
          title={title}
          description={options?.description}
          action={options?.action}
        />
      ),
      { id: options?.id },
    );
  },

  error: (
    title: ReactNode,
    options?: { description?: string; id?: string | number; duration?: number },
  ) => {
    return sonnerToast.custom(
      (id) => (
        <ToastComponent
          id={id}
          type="error"
          title={title}
          description={options?.description}
        />
      ),
      { id: options?.id, duration: options?.duration ?? 5000 },
    );
  },

  info: (title: ReactNode, description?: string) => {
    return sonnerToast.custom((id) => (
      <ToastComponent
        id={id}
        type="info"
        title={title}
        description={description}
      />
    ));
  },

  warning: (
    title: ReactNode,
    options?: { description?: string; id?: string | number; duration?: number },
  ) => {
    return sonnerToast.custom(
      (id) => (
        <ToastComponent
          id={id}
          type="warning"
          title={title}
          description={options?.description}
        />
      ),
      { id: options?.id, duration: options?.duration },
    );
  },
};
