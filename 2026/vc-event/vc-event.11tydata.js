import { readFileSync } from 'node:fs';

export default function () {
  const { event, quizzes } = JSON.parse(readFileSync(new URL('./claper-polls.json', import.meta.url), 'utf8'));
  const modelMatchingQuiz = quizzes.find((quiz) => quiz.title === 'Welk modelbegrip past bij de waterkwaliteitscasus?');
  if (!modelMatchingQuiz) throw new Error('De modelbegrippenquiz ontbreekt in claper-polls.json.');

  return { modelMatchingEvent: event, modelMatchingQuiz };
}
