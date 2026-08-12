import { expect, test } from 'vitest';
import type { AnswerPrompt } from './confirm-start.ts';
import { confirmWorkStart } from './confirm-start.ts';

type ConfirmationResult = {
  readonly closeCount: number;
  readonly confirmed: boolean;
  readonly messages: readonly string[];
  readonly questions: readonly string[];
};

const COUNT_INCREMENT = 1,
  QUESTION = '作業を開始しますか？ (OK/NG): ',
  confirmFor = (answers: readonly string[]): Promise<ConfirmationResult> => {
    const messages: string[] = [],
      questions: string[] = [],
      remainingAnswers = [...answers];
    let closeCount = 0;

    return confirmWorkStart({
      createPrompt: (): AnswerPrompt => ({
        ask: (question) => {
          questions.push(question);
          return Promise.resolve(remainingAnswers.shift() ?? 'NG');
        },
        close: () => {
          closeCount += COUNT_INCREMENT;
        },
      }),
      writeOutput: (output) => {
        messages.push(output);
      },
    }).then((confirmed) => ({
      closeCount,
      confirmed,
      messages,
      questions,
    }));
  };

test('OKを選択すると作業開始を承認する', async () => {
  const result = await confirmFor([' ok ']);

  expect(result).toEqual({
    closeCount: 1,
    confirmed: true,
    messages: [],
    questions: [QUESTION],
  });
});

test('NGを選択すると作業開始を拒否する', async () => {
  const result = await confirmFor(['NG']);

  expect(result).toEqual({
    closeCount: 1,
    confirmed: false,
    messages: [],
    questions: [QUESTION],
  });
});

test('OKまたはNG以外では再入力を求める', async () => {
  const result = await confirmFor(['yes', 'OK']);

  expect(result).toEqual({
    closeCount: 1,
    confirmed: true,
    messages: ['OKまたはNGを入力してください。\n'],
    questions: [QUESTION, QUESTION],
  });
});
