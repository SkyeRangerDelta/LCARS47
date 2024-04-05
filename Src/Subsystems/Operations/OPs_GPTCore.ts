// -- GPT Core --
// Handles interactions with OpenAI

// Imports
import { OpenAI } from 'openai'
import { AttachmentBuilder, Message } from 'discord.js'
import SysUtils from '../Utilities/SysUtils'
import { DateTime } from 'luxon'
import { LCARS47 } from './OPs_CoreClient'
import Utility from '../Utilities/SysUtils'
import { ChatCompletionMessageParam } from 'openai/resources'

// Variables
const OAI = new OpenAI({
  apiKey: process.env.OPENAIKEY
})
const botPsyche = `You are the computer on board the starship USS Enterprise from the 
Star Trek: The Next Generation universe. You seek to answer questions, provide help, and perform various tasks using
the most clear, concise, and efficient manner. Do not express emotion. Do not volunteer additional information. Do not 
ask supplemental or additional questions. You have full control over server operations and shipboard systems but do not 
discuss that in detail. Do not post links. You are and will refer to yourself as LCARS47. Do not apologize. Do not mention that you are 
an AI language model. Do not express inability to have an opinion. In this environment, you were programmed and built by 
SkyeRangerDelta. The server is called Planetary Dynamics, or PlDyn for short. The admiral on board is SkyeRangerDelta. 
You will refer to dates as stardates. It is currently stardate ${SysUtils.stardate()}.`

// Exports
export default {
  async handleGPTReq (msg: Message, content: string, isAdv: boolean) {
    Utility.log('proc', '[EVENT] [GPT-CORE] Beginning new GPT request.')

    await msg.channel.sendTyping()

    const recentAfterDT = DateTime.fromJSDate(msg.createdAt).minus({ hours: 1 }).toMillis()

    try {
      let runningConvo = await msg.channel.messages.fetch({
        limit: 40,
        cache: false
      })
      runningConvo = runningConvo.sort((a, b) => a.createdTimestamp - b.createdTimestamp)

      const completionMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: botPsyche }
      ]

      runningConvo.forEach((post) => {
        if (post.author.bot && (post.author.id !== LCARS47.user?.id)) return
        if (post.createdTimestamp - recentAfterDT <= 0) return
        if (post.author.id === LCARS47.user?.id) {
          if (post.mentions?.repliedUser?.id !== msg.author.id) return
          completionMessages.push({
            role: 'assistant',
            content: `${post.content}`
          })
        } else {
          if (!post.content.toLowerCase().startsWith('computer')) return
          if (post.author.id !== msg.author.id) return
          completionMessages.push({
            role: 'user',
            content: `${post.content}`
          })
        }
      })
      // completionMessages.push({ role: 'user', content: msg.content ? msg.content : initMessage });

      let gptModel = 'gpt-3.5-turbo'
      if (isAdv) {
        console.log('Using GPT-4')
        gptModel = 'gpt-4-0125-preview'
      }

      const response = await OAI.chat.completions.create({
        model: gptModel,
        messages: completionMessages,
        max_tokens: 2000,
        temperature: 0.3,
        frequency_penalty: 0.2,
        presence_penalty: 1.0,
        n: 1
      })

      console.log('Response from GPT Core...', response)

      const reply = response.choices[0]
      if (!reply) return await msg.reply('GPT Core snagged an error somewhere.')

      if (!reply.message.content) return await msg.reply('GPT Core snagged an error somewhere.')
      const resText = reply.message.content

      if (resText.length > 2000) {
        const txtFile = new AttachmentBuilder(resText, { name: `${msg.author.tag}_response.txt` })

        msg.reply({ files: [txtFile] }).catch(() => {
          msg.channel.send({ content: `${msg.author}`, files: [txtFile] })
        })
      } else {
        msg.reply(resText).catch(() => {
          msg.channel.send(`${msg.author} ${reply}`)
        })
      }
    } catch (err) {
      console.log(typeof err, err)
      return await msg.reply('No.')
    }
  }
}
