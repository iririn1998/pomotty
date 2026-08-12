import { createInterface } from 'node:readline/promises';
import process from 'node:process';

type AnswerPrompt = {
  readonly ask: (question: string) => Promise<string>;
  readonly close: () => void;
};

type ConfirmWorkStartParameters = {
  readonly createPrompt?: () => AnswerPrompt;
  readonly writeOutput?: (output: string) => void;
};

const INVALID_ANSWER_MESSAGE = 'OKまたはNGを入力してください。\n',
  START_CONFIRMATION_QUESTION = '作業を開始しますか？ (OK/NG): ',
  createAnswerPrompt = (): AnswerPrompt => {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return {
      ask: (question) => prompt.question(question),
      close: () => {
        prompt.close();
      },
    };
  },
  /** 作業を開始するか、OKまたはNGで確認します。 */
  confirmWorkStart = async ({
    createPrompt = createAnswerPrompt,
    writeOutput = (output) => {
      process.stdout.write(output);
    },
  }: ConfirmWorkStartParameters = {}): Promise<boolean> => {
    const prompt = createPrompt();

    try {
      for (;;) {
        const input = await prompt.ask(START_CONFIRMATION_QUESTION),
          answer = input.trim().toUpperCase();

        if (answer === 'OK') {
          return true;
        }

        if (answer === 'NG') {
          return false;
        }

        writeOutput(INVALID_ANSWER_MESSAGE);
      }
    } finally {
      prompt.close();
    }
  };

export { confirmWorkStart };
export type { AnswerPrompt, ConfirmWorkStartParameters };
