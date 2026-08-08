/**
 * 把字符串归一化成检索用形态：小写、去重音、去首尾空白。
 *
 * 用 NFD 分解后剔除拉丁组合记号（U+0300–U+036F），这样 café 与
 * cafe 能互相命中。
 *
 * 结尾必须重新 normalize('NFC')：日文的浊音/半浊音符（U+3099、
 * U+309A）也会被 NFD 拆开，例如 プ 会分解成 フ + U+309A。这些记号
 * 不在剔除范围内，若停留在分解态，字符串看起来正常但码点与用户
 * 输入的 NFC 形态不等，导致日文永远匹配不上。
 *
 * 注意德语 ß 不会变成 ss：那属于大小写折叠的特例，会影响其他
 * 语言的语义，不在检索归一化的职责范围内。
 */
export function foldForSearch(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}
