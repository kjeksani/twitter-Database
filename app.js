const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')

const app = express()

app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializerDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http:/localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error ${e.message}`)
  }
}

initializerDBAndServer()

const authenticationToken = (request, response, next) => {}

const ispasswordvalid = pass => {
  return pass.length > 5
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hasedpassword = await bcrypt.hash(password, 10)
  const dbuserexit = `select * from user where username='${username}';`
  const val = await db.get(dbuserexit)
  if (val !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (ispasswordvalid(password)) {
      const createquery = `Insert into user(username,password,name,gender)
      values('${username}','${hasedpassword}','${name}','${gender}');`
      await db.run(createquery)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectedvalue = `Select * from user where username='${username}'`
  const dbuser = await db.get(selectedvalue)
  if (dbuser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const value = await bcrypt.compare(password, dbuser.password)
    if (value === true) {
      const selectedvalue = `Select * from user where username='${username}'`
      const dbuser = await db.get(selectedvalue)
      const payload = {
        username,
        userId: dbuser.user_id,
      }
      const jwtToken = await jwt.sign(payload, 'Hello')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'Hello', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.userId = payload.userId
        request.username = payload.username
        next()
      }
    })
  }
}

const getuser = dbuser => {
  return {
    username: dbuser.username,
    tweet: dbuser.tweet,
    datetime: dbuser.date_time,
  }
}

const getfollowingpeopleidsuser = async username => {
  const getthefollowingpeoplequery = `select following_user_id from follower inner join user 
  on user.user_id=follower.follower_user_id where user.username='${username}'`
  const followingpeople = await db.all(getthefollowingpeoplequery)
  const arrayids = followingpeople.map(each => each.following_user_id)
  return arrayids
}

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const followingpeopleids = await getfollowingpeopleidsuser(username)
  const gettweetquery = `select username,tweet,date_time as dateTime from
  user inner join tweet on user.user_id=tweet.user_id
  where user.user_id in (${followingpeopleids})
  order by date_time desc
  limit 4;`
  const tweets = await db.all(gettweetquery)
  response.send(tweets)
})

app.get('/user/following/', authentication, async (request, response) => {
  const {username, userId} = request

  const selectedvalue = `Select * from user where username='${username}'`
  const dbuser = await db.get(selectedvalue)
  console.log(dbuser.user_id)
  const getfollowingusername = `select name from follower inner join user
  on user.user_id=follower.following_user_id
  where follower_user_id=${dbuser.user_id};`
  const followingpeople = await db.all(getfollowingusername)
  response.send(followingpeople)
})

app.get('/user/followers/', authentication, async (request, response) => {
  const {username, userId} = request
  const selectedvalue = `Select * from user where username='${username}'`
  const dbuser = await db.get(selectedvalue)
  const getfollowingsquery = `select distinct name from user inner join follower
  on user.user_id=follower.follower_user_id
  where following_user_id='${dbuser.user_id}';`
  const follower = await db.all(getfollowingsquery)
  response.send(follower)
})

const tweetAccessverification = async (request, response, next) => {
  const {username} = request
  const selectedvalue = `Select * from user where username='${username}'`
  const dbuser = await db.get(selectedvalue)
  const {userId} = request
  const {tweetId} = request.params
  const gettweetquery = `select * from tweet inner join follower on
  tweet.user_id=follower.following_user_id
  where tweet.tweet_id=${tweetId} and follower_user_id=${dbuser.user_id};`
  const tweet = await db.get(gettweetquery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.get(
  '/tweets/:tweetId/',
  authentication,
  tweetAccessverification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const gettweetquery = `select tweet ,(select count() from like where tweet_id=${tweetId}) as likes,
  (select count() from reply where tweet_id=${tweetId}) as replies, date_time as dateTime
  from tweet
  where tweet.tweet_id=${tweetId};`
    const tweet = await db.get(gettweetquery)
    response.send(tweet)
    console.log('hello')
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  tweetAccessverification,
  async (request, response) => {
    const {tweetId} = request.params
    const gettweetlikes = `select username from user inner join like on
  user.user_id=like.user_id
  where tweet_id=${tweetId};`
    const likeduser = await db.all(gettweetlikes)
    const userarray = likeduser.map(each => each.username)
    response.send({likes: userarray})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  tweetAccessverification,
  async (request, response) => {
    const {tweetId} = request.params
    const gettweetreply = `select name,reply from user inner join reply on user.user_id=reply.user_id
  where tweet_id=${tweetId}`
    const replytweet = await db.all(gettweetreply)
    response.send({replies: replytweet})
  },
)

app.get('/user/tweets/', authentication, async (request, response) => {
  const {username} = request
  const selectedvalue = `Select * from user where username='${username}'`
  const dbuser = await db.get(selectedvalue)
  const gettweetquery = `select tweet,
  count(distinct like_id) as likes,
  count(distinct reply_id) as replies,
  date_time as dateTime
  from tweet left join reply on tweet.tweet_id=reply.tweet_id 
  left join like on tweet.tweet_id=like.tweet_id
  where tweet.user_id=${dbuser.user_id}
  group by tweet.tweet_id;`
  const tweets = await db.all(gettweetquery)
  response.send(tweets)
})

app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const selectedvalue = `Select * from user where username='${username}'`
  const dbuser = await db.get(selectedvalue)
  const userId = parseInt(dbuser.user_id)
  const datetime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createtweetquery = `insert into tweet(tweet,user_id,date_time)
  values('${tweet}','${userId}','${datetime}')`
  await db.run(createtweetquery)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {username, userId} = request
  console.log(userId)
  const selectedvalue = `Select * from user where username='${username}'`
  const dbuser = await db.get(selectedvalue)
  const getthetweetquery = `select * from tweet where user_id=${dbuser.user_id} and tweet_id=${tweetId};`
  console.log(dbuser.user_id)
  const tweet = await db.get(getthetweetquery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deletequery = `delete from tweet where tweet_id=${tweetId};`
    await db.run(deletequery)
    response.send('Tweet Removed')
  }
})

module.exports = app
