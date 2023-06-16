const amqp = require('amqplib');
const config = require('./config');
const { Users } = require("./models");


class Producer {
    channel;

    async createChannel () {
        const connection = await amqp.connect(config.rabbitMQ.url);
        this.channel = await connection.createChannel();
    }

    async publishMessage(routingKey, message) {
        if (!this.channel) {
            await this.createChannel();
        }

        const exchangeName = config.rabbitMQ.exchangeName;
        await this.channel.assertExchange(exchangeName, "direct");

        const logDetails = {
            logType: routingKey,
            username : message,
            dateTime: new Date(),
        }

        await this.channel.publish(
            exchangeName,
            routingKey,
            Buffer.from(JSON.stringify(logDetails)),
            {persistent: true}
        );

        console.log(`The user ${message} is sent to exchange ${exchangeName}`);
    }
}

module.exports = Producer;