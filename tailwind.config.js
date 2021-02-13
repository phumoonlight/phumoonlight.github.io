module.exports = {
  purge: ['./*.html'],
  important: true,
  darkMode: false,
  theme: {
    extend: {
      backgroundImage: {
        'poly-forest': 'url("./assets/poly-forest.jpg")',
        'big-smoke': 'url("./assets/bigsmoke-wronghouse.jpg")',
        'abathur': 'url("./assets/abathur.jpg")'
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
