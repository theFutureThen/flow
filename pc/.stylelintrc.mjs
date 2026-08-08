export default {
  rules: {
    'property-disallowed-list': [
      [
        'margin-left', 'margin-right',
        'padding-left', 'padding-right',
        'border-left', 'border-right',
        'left', 'right',
      ],
      { message: '改用 CSS 逻辑属性（margin-inline-start / inset-inline-start 等），为 RTL 预留' },
    ],
    'declaration-property-value-disallowed-list': [
      {
        'text-align': ['left', 'right'],
        float: ['left', 'right'],
        clear: ['left', 'right'],
      },
      { message: '改用 start / end，为 RTL 预留' },
    ],
  },
};
