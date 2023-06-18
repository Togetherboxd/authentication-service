const request = require('supertest');
const app = require('../index');

describe('Authentication', () => {
  let accessToken;
  let refreshToken;

  test('should register a new user', async () => {
    const response = await request(app)
      .post('/register')
      .send({ username: 'testuser', password: 'password', isModerator: false, consent: true });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('By registering you agree to let us store your data. USER WITH USERNAME testuser REGISTERED');
  });

  test('should login a user', async () => {
    const response = await request(app)
      .post('/login')
      .send({ username: 'testuser', password: 'password' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');

    accessToken = response.body.accessToken;
    refreshToken = response.body.refreshToken;
  });

  test('should return user profile', async () => {
    const response = await request(app)
      .get('/profile')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.username).toBe('testuser');
  });

  test('should logout a user', async () => {
    const response = await request(app)
      .post('/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token: refreshToken });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('LOGGED OUT OF testuser');
  });
});

describe('Authorization', () => {
  let accessToken;

  beforeAll(async () => {
    const response = await request(app)
      .post('/login')
      .send({ username: 'admin', password: 'adminpassword' });

    accessToken = response.body.accessToken;
  });

  test('should return all users for moderator', async () => {
    const response = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('should return unauthorized for non-moderator', async () => {
    const response = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`); // Using the same access token for non-moderator user

    expect(response.statusCode).toBe(403);
    expect(response.body).toHaveProperty('error', 'Unauthorized');
  });
});