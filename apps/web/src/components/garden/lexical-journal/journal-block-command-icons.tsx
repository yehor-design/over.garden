import { CodeIcon } from "@/components/icons/Code";
import { ImageIcon } from "@/components/icons/Image";
import type { InterfaceIcon } from "@/components/icons";
import { LightbulbIcon } from "@/components/icons/Lightbulb";
import { ListBulletsIcon } from "@/components/icons/ListBullets";
import { ListChecksIcon } from "@/components/icons/ListChecks";
import { ListNumbersIcon } from "@/components/icons/ListNumbers";
import { MinusIcon } from "@/components/icons/Minus";
import { QuotesIcon } from "@/components/icons/Quotes";
import { TextHOneIcon } from "@/components/icons/TextHOne";
import { TextHThreeIcon } from "@/components/icons/TextHThree";
import { TextHTwoIcon } from "@/components/icons/TextHTwo";
import { TextTIcon } from "@/components/icons/TextT";

import type { JournalBlockCommandId } from "./journal-block-commands";

/**
 * One Phosphor glyph per block command (`OVE-487` criterion 6). The toolbar's
 * block menu, the gutter's add menu and the slash menu all read this record,
 * so a command cannot gain a menu without gaining its icon.
 */
export const JOURNAL_BLOCK_COMMAND_ICONS: Record<
  JournalBlockCommandId,
  InterfaceIcon
> = {
  paragraph: TextTIcon,
  heading1: TextHOneIcon,
  heading2: TextHTwoIcon,
  heading3: TextHThreeIcon,
  bulletList: ListBulletsIcon,
  numberList: ListNumbersIcon,
  todoList: ListChecksIcon,
  quote: QuotesIcon,
  callout: LightbulbIcon,
  code: CodeIcon,
  delimiter: MinusIcon,
  image: ImageIcon,
};
