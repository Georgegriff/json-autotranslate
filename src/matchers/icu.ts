import {
  parse,
  isLiteralElement,
  isTagElement,
  isPluralElement,
  isSelectElement,
} from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';

import type { AsyncReplaceFn, AsyncReplacer } from '.';

async function doTranslateAst(
  messageElements: MessageFormatElement[],
  translateText,
): Promise<MessageFormatElement[]> {
  const translatedElements = await Promise.all(
    messageElements.map(async (messageElement) => {
      if (isLiteralElement(messageElement)) {
        const originalValue = messageElement.value;
        // some services don't play well with whitespace, they remove it, manually handle that.
        const trimmedValue = originalValue.trim();
        const startingWhitespace =
          originalValue[0] !== trimmedValue[0] ? originalValue[0] : '';
        const endingWhitespace =
          originalValue[originalValue.length - 1] !==
          trimmedValue[trimmedValue.length - 1]
            ? originalValue[originalValue.length - 1]
            : '';
        messageElement.value = `${startingWhitespace}${await translateText(
          trimmedValue,
        )}${endingWhitespace}`;
      }

      if (isPluralElement(messageElement) || isSelectElement(messageElement)) {
        const optionEntries = await Promise.all(
          Object.keys(messageElement.options).map(async (id) => {
            const pluralChildElement = messageElement.options[id];
            const value = await doTranslateAst(
              pluralChildElement.value,
              translateText,
            );
            pluralChildElement.value = value;

            return [id, pluralChildElement];
          }),
        );
        messageElement.options = Object.fromEntries(optionEntries);
      }

      if (isTagElement(messageElement)) {
        const elementChildren = await doTranslateAst(
          messageElement.children,
          translateText,
        );
        messageElement.children = elementChildren;
      }

      return messageElement;
    }),
  );

  return translatedElements;
}

export const asyncReplace: AsyncReplaceFn = async (input, translateText) => {
  const astMessageElements = parse(input);
  const translatedMessaged = await doTranslateAst(
    astMessageElements,
    translateText,
  );
  // convert back to string
  return printAST(translatedMessaged);
};
export const icuReplacer: AsyncReplacer = {
  asyncReplacer: asyncReplace,
};
