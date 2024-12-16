//import express and express router as shown in lecture code and worked in previous labs.  Import your data functions from /data/movies.js that you will call in your routes below
import express from 'express';
const router = express.Router();
import * as gamesData from '../data/games.js'
import * as userData from '../data/users.js'
import * as reviewsData from '../data/reviews.js'
import validation from '../helpers.js'
import xss from 'xss';

router.route('/').get(async (req, res) => {
  //code here for GET will render the home handlebars file
  try{
    const genres = ["Adventure", "Shooter","Racing","Simulator","Puzzle","Indie"]; 
    let genreGames = {};
    for (let genre of genres) {
      genreGames[genre] = await gamesData.getGamesByGenre(genre);
    }

    let popularGames = await gamesData.getPopularGames();
    const getScore = await gamesData.getScore();
    res.render('home', { 
      title: 'Playd', 
      genreGames: genreGames,
      popularGames: popularGames,
      scoreGames: getScore,
      user: req.session.user 
    });
  }
  catch(e){
    res.status(500).json({error: 'cannot load page'});
  }
});

router.route('/gameSearch').post(async (req, res) => {
  //code here for POST this is where your form will be submitting searchByTitle and then call your data function passing in the searchByTitle and then rendering the search results of up to 50 Movies.
  let game = req.body.searchByTitle;
  game = xss(game);

  try{
    let results = await gamesData.searchGamesByTitle(game);
    if(!results || results.length === 0){
      return res.status(404).render('error', {
        isNotFoundError: true,
        title:"error",
        errorMessage: `We're sorry, but no results were found for "${game}".`
      });
    }
    res.render('searchResults',{ user: req.session.user, title:'gameSearch',games: results, game});
  } catch(e) { 
    res.status(500).render('error', {
      isServerError: true,
      title:"error",
      errorMessage: e.message || "An unexpected error occurred."
    });
  }
});

router.route('/getGame/:id').get(async (req, res) => {
  let id = req.params.id

  try{
    let gameInfo = await gamesData.getGameById(id);
    if (gameInfo?.reviews) {
      gameInfo.reviews.sort((a, b) => {
        const likesA = Object.keys(a.likes || {}).length; // Count likes for review `a`
        const likesB = Object.keys(b.likes || {}).length; // Count likes for review `b`
        return likesB - likesA; // Sort by descending order
      });
    }
    let isFavorited = false;
    if (req.session?.user) {
      const user = await userData.getUserById(req.session.user.userId);
      if(!user.likedGames){} //in the scenario you dont have liked games this would crash
      else{
        isFavorited = user.likedGames.includes(id); // Compare with `game_id`
      }
    }

    res.render('getgame', {
      game: gameInfo,
      isFavorited,
      title:'getgame', 
      user: req.session.user
    });
  } catch(e) {
    return res.status(404).render('error', {
      isServerError: true,
      title:"error",
      errorMessage: "No Game found with that id"
    });
  }
});
router.route('/getGame/:id').post(async (req, res) => {
  let id = req.params.id
  let {stars,review} = req.body;
  review = xss(review);
  let gameInfo;
  try{
    gameInfo = await gamesData.getGameById(id);
    if (!gameInfo) {
      throw new Error("Game not found");
    }
    let userId = req.session.user.userId
    gameInfo = await reviewsData.addReview(userId,id,Number(stars),review);
    if (gameInfo?.reviews) {
      gameInfo.reviews.sort((a, b) => {
        const likesA = Object.keys(a.likes || {}).length; // Count likes for review `a`
        const likesB = Object.keys(b.likes || {}).length; // Count likes for review `b`
        return likesB - likesA; // Sort by descending order
      });
    }
    res.render('getgame', { game: gameInfo, title:'getgame', user: req.session.user});
  }
  catch(e){
    if (e.message === "You have already posted a review for this game.") {
      return res.status(400).render('getgame', {
        isServerError: false,
        title: "getgame",
        user: req.session.user,
        game: gameInfo,
        error: e.message || "You have already reviewed this game."
      });
    }

    // General error handling for other issues (game not found, etc.)
    return res.status(404).render('error', {
      isServerError: true,
      title: "Error",
      errorMessage: e || "No Game found with that id"
    });
  }
});

router.post('/favorite', async (req, res) => {
  const { gameId, isFavorited } = req.body;
  const userId = req.session?.user?.userId;

  console.log('Favorite route hit');
  console.log({ gameId, isFavorited, userId });

  try {
      if (!userId) throw new Error('User not authenticated');
      if (!gameId) throw new Error('Game ID not provided');

      if (isFavorited) {
          await userData.removeFavoriteGame(userId, gameId);
      } else {
          await userData.addFavoriteGame(userId, gameId);
      }

      res.json({ success: true, newState: !isFavorited });
  } catch (e) {
      console.error('Error in favorite route:', e.message);
      res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/like', async (req,res) => {
  const { gameId, isLiked, reviewId } = req.body;
  const userId = req.session?.user?.userId;
  console.log('like button hit');
  console.log({ gameId, isLiked, reviewId });
  let review = null;
  if(userId){
  review = await reviewsData.addLike(reviewId,userId,gameId);
  res.json({likes: review.likes.length, dislikes: review.dislikes.length})
  }
  
});

router.post('/dislike', async (req,res) => {
  const { gameId, isDisliked, reviewId } = req.body;
  const userId = req.session?.user?.userId;
  console.log('dislike button hit');
  console.log({ gameId, isDisliked, reviewId });
  let review = null;
  if(userId){
  review = await reviewsData.addDislike(reviewId,userId,gameId);
  res.json({likes: review.likes.length, dislikes: review.dislikes.length});
  }
});
//export router
export default router;