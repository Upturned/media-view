# Features for the future (after milestone 8 and proper testing of what we have):

## Overall features

- Simple user feature, allowing someone to register (saved locally in the library db). From that, they can associate their user with a artist, or model, or character (any tag), that shows in a "by me" or "featuring you" section in the profile page. (No authentication intended, just selecting a local user and having the option to set a simple password to protect it, not encrypted while testing, but we should come up with a simple encryption for the actual shippable version).

- Collections with purposes: I intended this to be a whole different project, but it seems to fit nicely in this one. The idea is having an option to choose the "purpose" of the collection, and based on that choice, we could show the images in a specific way, or let the user use features specific for that purpose. A few examples:
 - Comic book: The user can select the images, and the app will show them as pages, and let the user print in a comic format, choosing orientation, margin, etc. The first intent is making each A4 page have two images as each half of the page, and printing it that way, so the user can take the printed paper, fold it in half, find a way to hold it (clips or staples), and they have a improvised comic book in their hands.
 - Photo montage: The user select a few or several images, pick a resolution or aspect ratio, place the images there and drag, resize and rotate the images.
 - Magazine: Intended to work once the text module is ready and working, lets the user pick images and writing over them, managing opacity/saturation/contrast of the image and text, enabling them to set up a magazine like structure, intertwining images and texts in pages. Also letting them print it, like the comic book.

- This one is aimed at the development: Build/Packaging options, them being 'testing' (mostly relevant for testing the AI features), 'complete' (for packaging with everything needed to run the app, not needing additional downloads in the destinations machine), 'normal' (that will probaly be the deafult no explicit option, and builds as it does today).

---

## Ai features:

- Incorporating tiny language models to have tiny text generated from descriptions, or having minigames related to the images tags or themes.

- Incorporating medium size language models to generate small stories about the images, or helping write Stories, given a theme. Also for Suggesting descriptions for the images.

- Vision language models for image descriptions to power other AI functions, such as suggesting descriptions, or generating stories from the images. The other way around would also be good, generating images from tiny stories, or generating similar images from a image's description.

Obs.: For the models incorporated, the best generation quality is interest #1, but it would also be important to have no restrictions of themes and genres, so Models ideally should have no NSFW, gore, sexual, violence restrictions at all. Would be good implementing a guard though, if the user is asking for something that is not cool or legal, we should warn them, trying to prevent, but not limiting them.

---

## Notes: 
### Media view started as a personal project that I'd use for two things: 
1. Organizing media in a gallery like interface, being able to create and manage categories and albums, and was intended for personal use.
2. As the project started, I saw potential for connecting different kinds of media. I like reading and writing stories, and drawing things related to them. From that was born the tagging idea and being able to filter and connect different types of media by those tags. And since we were organizing images and texts, why not videos and audios also?
### But as testing went by and as I showed the project to friends, a lot of suggestions appeared and a lot of features were seen as a natural upgrade to the software:
- More robust tagging system;
- Being able to have sub-categories;
- Having "fake" albums, that turned out as the collections we have now;
- Implementing AI features such as:
 - Tags suggestions;
 - Face and character recognition;
 - Image to text for descriptions, and vice versa;
 - Among other;
- Lots of quality of life were suggested and implemented as well;
### So even though it started as a small personal project, this Media Viewer app is growing to be a decently sized project, useful for different people and for different purposes. It is not intended to be officially distributed, being used only by its creator, and the close people who helped building it with wither code contribution or with ideas, as well as those who showed interest and had interesting ideas for its use.
---

