docker build . -t rangy
docker run -it --rm -v $(pwd):/app rangy node ./builder/build.js