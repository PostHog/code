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
      style={{ flexShrink: 0 }}
      className="border-gray-6 border-t bg-gray-1"
    >
      <Flex align="center" gap="2">
        <KeyHint keys={["↑", "↓"]} />
        <Code variant="ghost" color="gray" className="text-[13px] leading-5">
          Navigate
        </Code>
      </Flex>
      <Flex align="center" gap="2">
        <KeyHint keys={["↵"]} />
        <Code variant="ghost" color="gray" className="text-[13px] leading-5">
          Select
        </Code>
      </Flex>
      <Flex align="center" gap="2">
        <KeyHint keys={["Esc"]} />
        <Code variant="ghost" color="gray" className="text-[13px] leading-5">
          Close
        </Code>
      </Flex>
    </Flex>
  );
}
