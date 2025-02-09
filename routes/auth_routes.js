import { signInUser, signUpUser, getUserById, addFollowedUser } from '../data/users.js';
import { getGameById } from '../data/games.js';
import express from 'express';
import { redirectAuthenticated, requireAuthentication } from '../middleware.js';
import xss from 'xss';

const router = express.Router();


router
    .route('/signupuser')
    .get(redirectAuthenticated('/user'), async (req, res) => {
        res.render('signupuser', { user: req.session.user, title: 'Sign Up' });
    })
    .post(async (req, res) => {
        try {
            const firstName = xss(req.body.firstName);
            const lastName = xss(req.body.lastName);
            const userId = xss(req.body.userId);
            const password = xss(req.body.password);
            const result = await signUpUser(firstName, lastName, userId, password);

            if (result.registrationCompleted) {
                return res.redirect('/signinuser');
            } else {
                res.status(500).render('signupuser', {
                    error: 'Internal Server Error.',
                    data: req.body,
                    title: 'Sign Up',
                    user: req.session.user
                });
            }
        } catch (e) {
            res.status(400).render('signupuser', {
                error: e,
                data: req.body,
                title: 'Sign Up',
            });
        }
    });

router
    .route('/signinuser')
    .get(redirectAuthenticated('/user'), async (req, res) => {
        res.render('signinuser', { user: req.session.user, title: 'Sign In' });
    })
    .post(async (req, res) => {
        const userId = xss(req.body.userId);
        const password = xss(req.body.password);
        try {
            const user = await signInUser(userId, password);

            req.session.user = {
                firstName: user.firstName,
                lastName: user.lastName,
                userId: user.userId,
            };
            res.redirect('/user');
        } catch (e) {
            res.status(400).render('signinuser', {
                error: e,
                data: { userId },
                title: 'Sign In',
            });
        }
    });

router.route('/user').get(requireAuthentication('/signinuser'), async (req, res) => {
    const { firstName, lastName } = req.session.user;
    const userId = xss(req.session.user.userId);

    try {
        //console.log(`Fetching user: ${userId}`); // Debug log
        const user = await getUserById(userId);
        //console.log('User data:', user); // Debug log

        const likedGames = user.likedGames
            ? await Promise.all(user.likedGames.map(async (gameId) => {
                try {
                    return await getGameById(xss(gameId));
                } catch (e) {
                    console.warn(`Skipping invalid game ID: ${gameId}`);
                    return null;
                }
            })).then(games => games.filter(game => game)) // Remove nulls
            : [];

        const followedUsers = user.followedUsers || [];

        //console.log('Liked games:', likedGames); // Debug log

        res.render('user', {
            user: req.session.user,
            title: 'User Profile',
            firstName,
            lastName,
            currentTime: new Date().toLocaleTimeString(),
            currentDate: new Date().toLocaleDateString(),
            likedGames,
            followedUsers,
        });
    } catch (e) {
        console.error('Error in /user route:', e.message);
        res.status(500).render('error', {
            isServerError: true,
            title: 'Error',
            errorMessage: 'Unable to load user profile',
        });
    }
});

router.route('/signoutuser').get(requireAuthentication('/signinuser'), async (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).render('error', { error: 'Failed to log out.', title: 'Error' });
        }
        res.redirect('/');
    });
});

router.post('/follow', async (req, res) => {

    let userIdToFollow = xss(req.body.userIdToFollow);
    const currentUserId = xss(req.session.user.userId);

    try {
        if (!userIdToFollow || typeof userIdToFollow !== 'string') {
            throw new Error('Invalid User ID provided');
        }
        userIdToFollow = userIdToFollow.trim().toLowerCase();
        if (currentUserId === userIdToFollow) {
            throw new Error('You cannot follow yourself');
        }

        const userToFollow = await getUserById(userIdToFollow); // Ensure the user exists
        if (!userToFollow) {
            throw new Error('User not found');
        }
        await addFollowedUser(currentUserId, userIdToFollow);

        res.redirect('/user'); // Redirect back to the user profile
    } catch (e) {
        console.error('Error in /follow route:', e.message);
        const { firstName, lastName, userId } = req.session.user;
        const user = await getUserById(userId);
        const followedUsers = user.followedUsers || [];
        const likedGames = user.likedGames
            ? await Promise.all(user.likedGames.map(async (gameId) => {
                try {
                    return await getGameById(gameId);
                } catch (e) {
                    console.warn(`Skipping invalid game ID: ${gameId}`);
                    return null;
                }
            })).then(games => games.filter(game => game)) // Remove nulls
            : [];
        res.status(500).render('user', {
            error: e.message, title: 'User Profile', currentTime: new Date().toLocaleTimeString(),
            currentDate: new Date().toLocaleDateString(), user: req.session.user, firstName,
            lastName, followedUsers, likedGames
        });
    }
});

router.get('/profile/:userId', async (req, res) => {
    const userId = xss(req.params.userId);

    try {
        const user = await getUserById(userId);

        // Fetch detailed game info for liked games
        const likedGames = user.likedGames
            ? await Promise.all(user.likedGames.map(async (gameId) => {
                try {
                    return await getGameById(xss(gameId));
                } catch (e) {
                    console.warn(`Skipping invalid game ID: ${gameId}`);
                    return null;
                }
            })).then(games => games.filter(game => game)) // Remove nulls
            : [];

        const reviewsWithGameNames = user.reviews
            ? await Promise.all(user.reviews.map(async (review) => {
                try {
                    const game = await getGameById(xss(review.game_id));
                    return { ...review, gameName: game ? game.name : 'Unknown Game' };
                } catch (e) {
                    console.warn(`Skipping invalid game ID: ${review.game_id}`);
                    return { ...review, gameName: 'Unknown Game' };
                }
            }))
            : [];
        const sortedReviews = reviewsWithGameNames.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.render('profile', {
            title: `${user.firstName} ${user.lastName}'s Profile`,
            reviews: sortedReviews,
            user: { ...user, likedGames }, // Attach enriched likedGames
        });
    } catch (e) {
        console.error('Error in /profile/:userId route:', e.message);
        res.status(404).render('error', {
            title: 'User Not Found',
            error: e.message,
        });
    }
});


export default router;
