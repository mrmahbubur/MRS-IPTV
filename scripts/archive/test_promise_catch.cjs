const fetchPlaylist = async () => {
  try {
    throw new TypeError('Failed to fetch');
  } catch(e) {
    return '';
  }
}
Promise.all([fetchPlaylist()]).then(() => console.log('then')).catch(e => console.error('catch', e));
