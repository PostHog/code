import { KeyHint } from "@features/command/components/KeyHint";
import { Code, Flex } from "@radix-ui/themes";

export function CommandKeyHints() {
  return (
    <Flex
      align="center"
      justify="center"
      gap="4"
      px="3"
      py="2"
      className="shrink-0 border-gray-6 border-t bg-gray-1"
    >
      <Flex align="center" gap="2">
        <KeyHint keys={["↑", "↓"]} />
        <Code variant="ghost" color="gray" className="text-[13px]">
          Navigate
        </Code>
      </Flex>
      <Flex align="center" gap="2">
        <KeyHint keys={["↵"]} />
        <Code variant="ghost" color="gray" className="text-[13px]">
          Select
        </Code>
      </Flex>
      <Flex align="center" gap="2">
        <KeyHint keys={["Esc"]} />
        <Code variant="ghost" color="gray" className="text-[13px]">
          Close
        </Code>
      </Flex>
    </Flex>
  );
}
