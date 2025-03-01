
import { helperFunction, CONSTANTS } from './module-a';

export function processValue(value: string) {
  if (value.length > CONSTANTS.MAX_LENGTH) {
    return CONSTANTS.DEFAULT_VALUE;
  }
  return helperFunction(value);
}
  